/**
 * aiHeuristic.js — Connect 4 Board Evaluation Heuristic
 * ───────────────────────────────────────────────────────
 * Pure-function board scoring used by the Minimax AI engine in ai.js.
 * No DOM access, no side effects — only reads boards and returns numbers.
 *
 * Globals consumed: GameState (ROWS, COLS, PLAYER, AI constants)
 * Globals exposed:  AI_HEURISTIC
 *
 * Public API:
 *   AI_HEURISTIC.scoreWindow(window, player) → number
 *   AI_HEURISTIC.evaluateBoard(board)        → number
 *
 * Split from ai.js so neither file exceeds a comfortable reading length.
 */

const AI_HEURISTIC = (() => {

  // ─────────────────────────────────────────────
  // WINDOW SCORING
  // ─────────────────────────────────────────────

  /**
   * Scores a single "window" of exactly 4 consecutive cells from the
   * AI's perspective. Returns a positive value if the window favours AI
   * and a negative value if it favours the player.
   *
   * Score table (from AI's perspective):
   *   +100  AI has all 4           — complete win (normally caught before this)
   *   + 50  AI has 3, 1 empty      — one move from winning
   *   + 10  AI has 2, 2 empty      — developing
   *   - 80  player has 3, 1 empty  — must block (weighted heavier than +50)
   *   -  5  player has 2, 2 empty  — mild threat
   *
   * A "mixed" window (both players have pieces) is dead — it scores 0.
   *
   * @param {number[]} window  Exactly 4 cell values (EMPTY, PLAYER, or AI)
   * @param {number}   player  The "friendly" player (always GameState.AI here)
   * @returns {number}
   */
  function scoreWindow(window, player) {
    const opponent = (player === GameState.AI) ? GameState.PLAYER : GameState.AI;

    let playerCount   = 0;
    let opponentCount = 0;
    let emptyCount    = 0;

    for (const cell of window) {
      if      (cell === player)   playerCount++;
      else if (cell === opponent) opponentCount++;
      else                        emptyCount++;
    }

    if (playerCount > 0 && opponentCount > 0) return 0; // dead window

    if (playerCount === 4)                       return  100;
    if (playerCount === 3 && emptyCount === 1)   return   50;
    if (playerCount === 2 && emptyCount === 2)   return   10;

    if (opponentCount === 3 && emptyCount === 1) return  -80;
    if (opponentCount === 2 && emptyCount === 2) return   -5;

    return 0;
  }


  // ─────────────────────────────────────────────
  // FULL BOARD EVALUATION
  // ─────────────────────────────────────────────

  /**
   * Assigns a numeric score to a board state from the AI's perspective.
   * Called at depth-0 leaf nodes when the game is not yet terminal.
   *
   * Scoring structure:
   *   1. Center column bonus — rewards the most strategically valuable columns
   *   2. Horizontal windows  (6 rows × 4 windows = 24 total)
   *   3. Vertical windows    (7 cols × 3 windows = 21 total)
   *   4. Diagonal ↘ windows  (3 × 4 = 12 total)
   *   5. Diagonal ↗ windows  (3 × 4 = 12 total)
   *
   * Center column bonus rationale:
   *   Column 3 participates in more potential winning lines than any other.
   *   The bonus map [1,2,3,4,3,2,1] approximates that without exact counting,
   *   nudging the AI toward center play in the early game.
   *
   * @param {number[][]} board  The board to evaluate (never mutated)
   * @returns {number}  Positive = good for AI, negative = good for player
   */
  function evaluateBoard(board) {
    let score = 0;

    // ── 1. Center column bonus ──────────────────────────────────────────
    const centerBonusMap = [1, 2, 3, 4, 3, 2, 1]; // index = column

    for (let col = 0; col < GameState.COLS; col++) {
      const bonus = centerBonusMap[col];
      for (let row = 0; row < GameState.ROWS; row++) {
        if      (board[row][col] === GameState.AI)     score += bonus;
        else if (board[row][col] === GameState.PLAYER) score -= bonus;
      }
    }

    // ── 2. Horizontal windows (→) ───────────────────────────────────────
    // (COLS - 3) = 4 starting positions per row × 6 rows = 24 windows
    for (let row = 0; row < GameState.ROWS; row++) {
      for (let col = 0; col <= GameState.COLS - 4; col++) {
        const window = [
          board[row][col],
          board[row][col + 1],
          board[row][col + 2],
          board[row][col + 3],
        ];
        score += scoreWindow(window, GameState.AI);
      }
    }

    // ── 3. Vertical windows (↓) ─────────────────────────────────────────
    // (ROWS - 3) = 3 starting positions per col × 7 cols = 21 windows
    for (let col = 0; col < GameState.COLS; col++) {
      for (let row = 0; row <= GameState.ROWS - 4; row++) {
        const window = [
          board[row][col],
          board[row + 1][col],
          board[row + 2][col],
          board[row + 3][col],
        ];
        score += scoreWindow(window, GameState.AI);
      }
    }

    // ── 4. Diagonal windows (↘) ─────────────────────────────────────────
    // rows 0–2, cols 0–3 → 3 × 4 = 12 windows
    for (let row = 0; row <= GameState.ROWS - 4; row++) {
      for (let col = 0; col <= GameState.COLS - 4; col++) {
        const window = [
          board[row][col],
          board[row + 1][col + 1],
          board[row + 2][col + 2],
          board[row + 3][col + 3],
        ];
        score += scoreWindow(window, GameState.AI);
      }
    }

    // ── 5. Diagonal windows (↗) ─────────────────────────────────────────
    // rows 3–5, cols 0–3 → 3 × 4 = 12 windows
    for (let row = 3; row < GameState.ROWS; row++) {
      for (let col = 0; col <= GameState.COLS - 4; col++) {
        const window = [
          board[row][col],
          board[row - 1][col + 1],
          board[row - 2][col + 2],
          board[row - 3][col + 3],
        ];
        score += scoreWindow(window, GameState.AI);
      }
    }

    return score;
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return { scoreWindow, evaluateBoard };

})();
