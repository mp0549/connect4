/**
 * ui.js — DOM Rendering module
 * ─────────────────────────────
 * Translates game state (plain JS arrays from gameState.js) into
 * visible DOM changes. This module never modifies game state — it
 * only reads and reflects it.
 *
 * Responsibilities:
 *   - Build the 42-cell board grid and 7 column indicator buttons once
 *   - Re-render board cell states after every move
 *   - Play the drop animation on the last-placed piece
 *   - Highlight the winning four cells at game end
 *   - Enable/disable column buttons to gate input
 *   - Update the status bar text and turn counter
 *
 * Dependency: GameState constants (ROWS, COLS, PLAYER, AI) are read
 * from the globally-available GameState object (loaded before this file).
 */

const UI = (() => {

  // ─────────────────────────────────────────────
  // DOM REFERENCES  (cached at module init)
  // ─────────────────────────────────────────────

  const boardEl        = document.getElementById('board');
  const colIndicatorsEl = document.getElementById('col-indicators');
  const statusTextEl   = document.getElementById('status-text');
  const turnCountEl    = document.getElementById('turn-count');


  // ─────────────────────────────────────────────
  // MODULE-LEVEL REFERENCES
  // These are populated by buildBoard() and reused
  // on every subsequent render call.
  // ─────────────────────────────────────────────

  /**
   * 2-D array of cell <div> elements.
   * cellElements[row][col] gives O(1) access to any cell's DOM node.
   * @type {HTMLDivElement[][]}
   */
  let cellElements = [];

  /**
   * Array of 7 column indicator <button> elements (above the board).
   * @type {HTMLButtonElement[]}
   */
  let colButtons = [];

  /**
   * The function to call when the user clicks a column indicator.
   * Provided by main.js via buildBoard(). Receives the 0-indexed column.
   * @type {Function|null}
   */
  let onColumnClick = null;


  // ─────────────────────────────────────────────
  // BOARD CONSTRUCTION  (called once on page load)
  // ─────────────────────────────────────────────

  /**
   * Builds the entire interactive board structure in the DOM.
   *
   * Creates:
   *   • 7 column indicator buttons in #col-indicators
   *   • 42 board cells (6 rows × 7 cols) in #board
   *   • Each cell contains one .piece div
   *
   * After this call, the board is ready to be rendered via renderBoard().
   * This should only be called ONCE per page load. Subsequent game resets
   * call renderBoard() directly, which just updates CSS classes on the
   * already-existing elements.
   *
   * @param {function(col: number): void} clickHandler
   *   Called by main.js when the user picks a column.
   */
  function buildBoard(clickHandler) {
    onColumnClick = clickHandler;

    // ── Column indicator buttons ──────────────────────────────────────
    colIndicatorsEl.innerHTML = '';
    colButtons = [];

    for (let col = 0; col < GameState.COLS; col++) {
      const btn = document.createElement('button');
      btn.className = 'col-indicator';
      btn.setAttribute('aria-label', `Drop piece in column ${col + 1}`);
      btn.dataset.col = String(col);

      // Hover → tint the entire column of cells
      btn.addEventListener('mouseenter', () => _highlightColumn(col, true));
      btn.addEventListener('mouseleave', () => _highlightColumn(col, false));

      // Click → hand off to game logic in main.js
      btn.addEventListener('click', () => {
        if (onColumnClick) onColumnClick(col);
      });

      colIndicatorsEl.appendChild(btn);
      colButtons.push(btn);
    }

    // ── Board cells ───────────────────────────────────────────────────
    boardEl.innerHTML = '';
    cellElements = [];

    // Build row by row so DOM order matches visual top-to-bottom order
    for (let row = 0; row < GameState.ROWS; row++) {
      cellElements[row] = [];

      for (let col = 0; col < GameState.COLS; col++) {
        // Outer container — carries data attributes for debugging convenience
        const cell = document.createElement('div');
        cell.className  = 'board-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);

        // Inner circle — the visual "piece"; state driven by CSS classes
        const piece = document.createElement('div');
        piece.className = 'piece';

        cell.appendChild(piece);
        boardEl.appendChild(cell);

        // Cache the reference so renderBoard() can update it without
        // touching the DOM query API on every frame
        cellElements[row][col] = cell;
      }
    }
  }


  // ─────────────────────────────────────────────
  // BOARD RENDERING
  // ─────────────────────────────────────────────

  /**
   * Syncs the visual board to the current logical board state.
   *
   * Called after every move. Iterates all 42 cells and sets the correct
   * CSS modifier class on the inner .piece element:
   *   EMPTY  → no modifier (shows as a faint empty circle)
   *   PLAYER → .piece--player  (solid black)
   *   AI     → .piece--ai      (dark red)
   *
   * Win / drop animation classes are applied separately by their own
   * functions so that renderBoard() can be called freely without
   * accidentally stripping those one-shot classes.
   *
   * @param {number[][]} board  The 6×7 game state array from GameState
   */
  function renderBoard(board) {
    for (let row = 0; row < GameState.ROWS; row++) {
      for (let col = 0; col < GameState.COLS; col++) {
        const piece = cellElements[row][col].querySelector('.piece');
        const value = board[row][col];

        // Always reset to the base class first, then apply the state class.
        // This ensures stale modifier classes from the previous game don't linger.
        piece.className = 'piece';

        if (value === GameState.PLAYER) {
          piece.classList.add('piece--player');
        } else if (value === GameState.AI) {
          piece.classList.add('piece--ai');
        }
        // value === EMPTY: no modifier needed
      }
    }
  }

  /**
   * Triggers the CSS drop animation on the piece that just landed.
   *
   * The trick: we remove the animation class, force a reflow (by reading
   * offsetWidth — a common browser hack), then re-add it. This resets the
   * animation timeline so it always plays from the beginning, even if the
   * same cell is used again in a new game.
   *
   * @param {number} row  0-indexed row where the piece landed
   * @param {number} col  0-indexed column
   */
  function animateDrop(row, col) {
    const piece = cellElements[row][col].querySelector('.piece');
    piece.classList.remove('piece--drop');
    void piece.offsetWidth; // force layout reflow — resets animation clock
    piece.classList.add('piece--drop');
  }

  /*
   * ── PHASE 2 CHEMICAL POUR animateDrop (saved, not active) ────────────
   * To re-enable: delete the Phase 1 animateDrop above and uncomment this.
   * Also uncomment the matching CSS block in style.css section 7.
   *
   * function animateDrop(row, col) {
   *   const piece = cellElements[row][col].querySelector('.piece');
   *
   *   // renderBoard() has already set piece--player/ai (CSS: scaleY(1)).
   *   // We override with inline scaleY(0), force a reflow to commit that
   *   // state, add the transition class, then release the inline override.
   *   // The browser now transitions from the committed 0 to the CSS 1.
   *   piece.classList.remove('piece--fill');   // clear stale transition
   *   piece.style.transform = 'scaleY(0)';    // force start state
   *   void piece.offsetWidth;                  // commit to render pipeline
   *   piece.classList.add('piece--fill');      // enable transition
   *   piece.style.transform = '';             // release → CSS scaleY(1) wins
   * }
   *
   * renderBoard() also needs piece.style.transform = '' after piece.className = 'piece':
   *   piece.className = 'piece';
   *   piece.style.transform = '';  // ← add this line
   * ── END PHASE 2 CHEMICAL POUR ─────────────────────────────────────── */

  /**
   * Adds the win-highlight style (.piece--win) to the four winning cells.
   * This draws a white inset ring on top of the filled piece colour,
   * making the winning line visually distinct without needing extra DOM.
   *
   * @param {Array<{row: number, col: number}>} cells  From GameState.checkWin()
   */
  function highlightWin(cells) {
    cells.forEach(({ row, col }) => {
      cellElements[row][col].querySelector('.piece').classList.add('piece--win');
    });
  }


  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  /**
   * Adds or removes the .col-hover tint from every cell in a column.
   * Called internally from the column button's mouseenter/mouseleave handlers.
   *
   * @param {number}  col    0-indexed
   * @param {boolean} active true = add tint, false = remove tint
   */
  function _highlightColumn(col, active) {
    for (let row = 0; row < GameState.ROWS; row++) {
      cellElements[row][col].classList.toggle('col-hover', active);
    }
  }


  // ─────────────────────────────────────────────
  // INTERACTION CONTROL
  // ─────────────────────────────────────────────

  /**
   * Enables or disables the column drop buttons.
   *
   * Called:
   *   • setInputEnabled(false)              — during AI turn or game over
   *   • setInputEnabled(true, validCols)    — at start of player's turn
   *     (only columns that still have space are enabled)
   *
   * @param {boolean}        enabled       Whether the board is interactive
   * @param {number[]|null}  validColumns  If provided, only these cols are enabled.
   *                                       Columns not in the list are disabled even
   *                                       when `enabled` is true (column is full).
   */
  function setInputEnabled(enabled, validColumns = null) {
    colButtons.forEach((btn, col) => {
      if (!enabled) {
        // Lock everything — AI is thinking or game is over
        btn.disabled = true;
      } else if (validColumns !== null) {
        // Player's turn: enable only columns that have room
        btn.disabled = !validColumns.includes(col);
      } else {
        // Unconditional enable (not used in Phase 1, reserved for Phase 2)
        btn.disabled = false;
      }
    });
  }


  // ─────────────────────────────────────────────
  // STATUS BAR
  // ─────────────────────────────────────────────

  /**
   * Updates the centre readout in the status bar.
   * CSS handles uppercasing and monospace styling.
   *
   * @param {string} message  Plain text status message
   */
  function setStatus(message) {
    statusTextEl.textContent = message;
  }

  /**
   * Updates the turn counter displayed in the status bar.
   *
   * @param {number} turn
   */
  function setTurnCount(turn) {
    turnCountEl.textContent = String(turn);
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return {
    buildBoard,
    renderBoard,
    animateDrop,
    highlightWin,
    setInputEnabled,
    setStatus,
    setTurnCount,
  };

})();
