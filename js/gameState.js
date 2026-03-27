/**
 * gameState.js — Pure game logic module
 * ─────────────────────────────────────
 * NO DOM access. NO side effects. This module only works with plain
 * JavaScript data structures (arrays of numbers). Every other module
 * may import from here, but this module imports nothing.
 *
 * The board is a 2-D array:  board[row][col]
 *   board[0][0]  = top-left corner   (visually)
 *   board[5][6]  = bottom-right corner (visually)
 *
 * Cell values:
 *   0 = EMPTY
 *   1 = PLAYER  (human)
 *   2 = AI
 *
 * Key design decision — immutability:
 *   dropPiece() always returns a NEW board array rather than mutating
 *   the one passed in. This is intentional: Phase 2's Minimax algorithm
 *   needs to explore thousands of hypothetical future board states
 *   without corrupting the "real" current board. Building this habit now
 *   means zero refactoring when we add the AI.
 */

const GameState = (() => {

  // ─────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────

  const ROWS       = 6;
  const COLS       = 7;
  const EMPTY      = 0;
  const PLAYER     = 1;
  const AI         = 2;
  const WIN_LENGTH = 4; // must connect exactly this many in a line


  // ─────────────────────────────────────────────
  // BOARD CREATION
  // ─────────────────────────────────────────────

  /**
   * Returns a fresh, empty 6×7 board.
   *
   * Array.from with a map function is idiomatic for building 2-D arrays.
   * It avoids the common JS trap of Array(6).fill([]) where all rows
   * would share the same array reference.
   *
   * @returns {number[][]}
   */
  function createBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
  }


  // ─────────────────────────────────────────────
  // MOVE VALIDATION
  // ─────────────────────────────────────────────

  /**
   * A column is playable as long as its topmost cell (row 0) is empty.
   * Once row 0 is filled, no more pieces can enter that column.
   *
   * @param   {number[][]} board
   * @param   {number}     col    0-indexed
   * @returns {boolean}
   */
  function isValidMove(board, col) {
    return board[0][col] === EMPTY;
  }

  /**
   * Returns all column indices that currently accept a piece.
   * Minimax will call this to enumerate the AI's possible moves.
   *
   * @param   {number[][]} board
   * @returns {number[]}   e.g. [0, 1, 2, 4, 6] when columns 3 and 5 are full
   */
  function getValidColumns(board) {
    const valid = [];
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(board, col)) valid.push(col);
    }
    return valid;
  }


  // ─────────────────────────────────────────────
  // PIECE DROPPING
  // ─────────────────────────────────────────────

  /**
   * Simulates gravity: drops `player`'s piece into `col`.
   *
   * Algorithm:
   *   Scan from the bottom row (index 5) upward.
   *   The first empty cell encountered is where the piece lands.
   *
   * Returns a result object so the caller gets both the landing
   * coordinates (needed for animation and logging) and the new board.
   *
   * @param   {number[][]} board
   * @param   {number}     col     0-indexed
   * @param   {number}     player  PLAYER (1) or AI (2)
   * @returns {{ row: number, col: number, board: number[][] } | null}
   *          null if the column is full (invalid move)
   */
  function dropPiece(board, col, player) {
    if (!isValidMove(board, col)) return null;

    // Find the lowest empty row (gravity pulls pieces down)
    let landingRow = -1;
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === EMPTY) {
        landingRow = row;
        break; // bottom-most empty cell found; no need to keep scanning
      }
    }

    // Deep-copy the board so the original is never mutated.
    // board.map(row => [...row]) copies each inner array independently.
    const newBoard = board.map(r => [...r]);
    newBoard[landingRow][col] = player;

    return { row: landingRow, col, board: newBoard };
  }


  // ─────────────────────────────────────────────
  // WIN DETECTION
  // ─────────────────────────────────────────────

  /**
   * Checks whether `player` has four in a row anywhere on the board.
   *
   * Strategy: iterate every cell. For cells that belong to `player`,
   * fire a "ray" in each of the four possible directions. If a ray
   * reaches length 4, we have a winner.
   *
   * Four directions (expressed as [rowDelta, colDelta]):
   *   [0,  1]  →  horizontal      (only need to check rightward)
   *   [1,  0]  ↓  vertical        (only need to check downward)
   *   [1,  1]  ↘  diagonal down-right
   *   [1, -1]  ↗  diagonal down-left
   *
   * We only need to cast rays in these 4 directions (not their reverses)
   * because we will naturally hit every line from one endpoint or the other.
   *
   * @param   {number[][]} board
   * @param   {number}     player  PLAYER (1) or AI (2)
   * @returns {Array<{row:number, col:number}> | null}
   *          The four winning cell positions, or null if no win.
   */
  function checkWin(board, player) {
    const directions = [
      [0,  1],  // horizontal →
      [1,  0],  // vertical ↓
      [1,  1],  // diagonal ↘
      [1, -1],  // diagonal ↗
    ];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {

        // Only start a ray from a cell that belongs to `player`
        if (board[row][col] !== player) continue;

        for (const [dr, dc] of directions) {
          // Begin the run with the current cell
          const run = [{ row, col }];

          for (let step = 1; step < WIN_LENGTH; step++) {
            const r = row + dr * step;
            const c = col + dc * step;

            // Out of bounds → this ray can't make a winning run
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;

            // Cell doesn't belong to player → run is broken
            if (board[r][c] !== player) break;

            run.push({ row: r, col: c });
          }

          // Four consecutive cells of the same player = win
          if (run.length === WIN_LENGTH) return run;
        }
      }
    }

    return null; // no winning run found
  }

  /**
   * The board is "full" when no column can accept another piece.
   * At this point, if neither player has won, the game is a draw.
   *
   * @param   {number[][]} board
   * @returns {boolean}
   */
  function isBoardFull(board) {
    return getValidColumns(board).length === 0;
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return {
    // Constants (read-only by convention)
    ROWS, COLS, EMPTY, PLAYER, AI,

    // Functions
    createBoard,
    isValidMove,
    getValidColumns,
    dropPiece,
    checkWin,
    isBoardFull,
  };

})();
