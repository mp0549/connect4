/**
 * main.js — Application Orchestrator
 * ────────────────────────────────────
 * The top-level controller. It:
 *   1. Wires up one-time DOM event listeners (reset, clear-log)
 *   2. Owns the live game state variables (board, current player, turn count)
 *   3. Implements the game loop: player move → check terminal → AI move → repeat
 *   4. Delegates rendering to UI, logging to Visualizer, logic to GameState
 *
 * ┌─────────────┐    drop()    ┌────────────┐
 * │  GameState  │◄────────────│   main.js  │
 * │  (logic)    │─────────────►            │
 * └─────────────┘  new board  │ (owns state│
 *                             │  & flow)   │
 * ┌─────────────┐             │            │
 * │    UI       │◄────────────│            │
 * │  (DOM)      │   render()  └────────────┘
 * └─────────────┘
 *                             ┌────────────┐
 * ┌─────────────┐             │ Visualizer │
 * │  (Phase 2)  │             │  (log +    │
 * │  ai.js      │             │   stats)   │
 * └─────────────┘             └────────────┘
 *
 * ══════════════════════════════════════════════
 * PHASE 2 HOOK  — search for "PHASE 2 HOOK" in
 * this file to find the exact insertion point for
 * the Minimax AI call.
 * ══════════════════════════════════════════════
 */


// ─────────────────────────────────────────────
// LIVE GAME STATE
//
// These variables represent the single source of truth for the
// current game. Only functions in this file should mutate them.
// ─────────────────────────────────────────────

/** The live 6×7 board. Updated to the return value of GameState.dropPiece(). */
let board = GameState.createBoard();

/**
 * Current Minimax search depth — controlled by the difficulty buttons and
 * the advanced depth slider in the visualizer panel.
 * Easy = 2, Hard = 6. Slider allows 1–10.
 * Defaults to 6 (Hard).
 */
let currentDepth = 6;

/**
 * Whose turn is it?
 * GameState.PLAYER (1) or GameState.AI (2).
 * The player always goes first.
 */
let currentPlayer = GameState.PLAYER;

/**
 * Total pieces placed so far this game (0–42).
 * Displayed in the status bar as the "TURN" count.
 */
let turnCount = 0;

/**
 * Locks the game when set to true (win or draw).
 * Guards against clicks being processed after the game ends.
 */
let gameOver = false;


// ─────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────

/**
 * One-time setup: builds the DOM board and attaches persistent
 * event listeners. Called once when the page is ready.
 *
 * Separated from startGame() because:
 *   - buildBoard() only needs to run once (constructs 42 DOM nodes)
 *   - Event listeners should not be re-attached on every reset
 */
function initGame() {
  // Build the 42-cell grid and 7 column indicator buttons.
  // Pass handleColumnClick so the UI can call back into game logic.
  UI.buildBoard(handleColumnClick);

  // Reset button — restarts the game without rebuilding the DOM
  document.getElementById('reset-btn').addEventListener('click', startGame);

  // Clear-log button — wipes log entries but does not reset game state
  document.getElementById('clear-log-btn').addEventListener('click', () => {
    Visualizer.clearLog();
    Visualizer.logSystem('LOG CLEARED BY OPERATOR.');
  });

  // ── Difficulty controls ────────────────────────────────────────────────
  //
  // Three UI elements control `currentDepth`:
  //   • EASY button   → depth 2  (fast, beatable)
  //   • MED button    → depth 4  (moderate challenge)
  //   • HARD button   → depth 6  (strong, default)
  //   • ADVANCED toggle → shows the depth slider (depth 1–10, manual)
  //
  // The active button gets .lab-btn--active (inverted colors) to show the
  // current selection. Slider input clears all presets (none is "active").

  const easyBtn      = document.getElementById('diff-easy');
  const medBtn       = document.getElementById('diff-med');
  const hardBtn      = document.getElementById('diff-hard');
  const toggleBtn    = document.getElementById('diff-toggle');
  const advPanel     = document.getElementById('diff-advanced');
  const depthSlider  = document.getElementById('depth-slider');
  const depthDisplay = document.getElementById('depth-display');

  /** All three preset buttons — used to clear highlights in one pass. */
  const presetBtns = [easyBtn, medBtn, hardBtn];

  /**
   * Sets the active depth and syncs the slider + display to match.
   * Also clears and re-sets the active-button highlight.
   *
   * @param {number}          depth     The new search depth
   * @param {HTMLElement|null} activeBtn The button to highlight, or null for slider mode
   */
  function applyDifficulty(depth, activeBtn) {
    currentDepth = depth;
    depthSlider.value        = depth;
    depthDisplay.textContent = String(depth);
    // Clear all preset highlights, then re-apply to the chosen one
    presetBtns.forEach(btn => btn.classList.remove('lab-btn--active'));
    if (activeBtn) activeBtn.classList.add('lab-btn--active');
  }

  easyBtn.addEventListener('click', () => applyDifficulty(2, easyBtn));
  medBtn .addEventListener('click', () => applyDifficulty(4, medBtn));
  hardBtn.addEventListener('click', () => applyDifficulty(6, hardBtn));

  // Advanced toggle — shows/hides the slider row
  toggleBtn.addEventListener('click', () => {
    const isOpen = advPanel.classList.toggle('open');
    toggleBtn.textContent = isOpen ? 'ADV ▴' : 'ADV ▾';
  });

  // Slider input — live update while dragging (no preset active in slider mode)
  depthSlider.addEventListener('input', () => {
    applyDifficulty(parseInt(depthSlider.value, 10), null);
  });

  // ── Help overlay ──────────────────────────────────────────────────────
  const helpOverlay  = document.getElementById('help-overlay');
  const helpBtn      = document.getElementById('help-btn');
  const closeHelpBtn = document.getElementById('close-help-btn');

  function showHelp() { helpOverlay.classList.remove('hidden'); }
  function hideHelp() {
    helpOverlay.classList.add('hidden');
    localStorage.setItem('helpSeen', '1');
  }

  helpBtn.addEventListener('click', showHelp);
  closeHelpBtn.addEventListener('click', hideHelp);
  helpOverlay.addEventListener('click', hideHelp); // backdrop click closes

  // Show automatically on the very first visit; skip on return visits.
  if (!localStorage.getItem('helpSeen')) showHelp();

  // Start the first game immediately
  startGame();
}

/**
 * Resets all game state variables and the UI to a clean slate.
 * Safe to call repeatedly (e.g. on reset button press).
 */
function startGame() {
  // ── Reset state variables ──
  board         = GameState.createBoard();
  currentPlayer = GameState.PLAYER; // human always moves first
  turnCount     = 0;
  gameOver      = false;

  // ── Sync the UI ──
  UI.renderBoard(board);
  UI.setStatus('YOUR MOVE — SELECT A COLUMN');
  UI.setTurnCount(turnCount);
  UI.setInputEnabled(true, GameState.getValidColumns(board));

  // ── Sync the visualizer ──
  Visualizer.resetStats();
  Visualizer.clearLog();
  TREE_CANVAS.clearTree();
  Visualizer.logGameStart();
}


// ─────────────────────────────────────────────
// GAME LOOP — PLAYER TURN
// ─────────────────────────────────────────────

/**
 * Handles a column selection by the human player.
 *
 * Called by UI.buildBoard's internal click listener with the 0-indexed
 * column number whenever a column indicator button is clicked.
 *
 * Turn flow:
 *   1. Validate the move
 *   2. Apply it → get new board
 *   3. Render + animate
 *   4. Check for win / draw
 *   5. Hand off to the AI
 *
 * @param {number} col  0-indexed column clicked by the player
 */
function handleColumnClick(col) {
  // Guard: ignore clicks when it's not the player's turn or game is over
  if (gameOver || currentPlayer !== GameState.PLAYER) return;

  // Guard: ignore clicks on a full column (shouldn't happen if setInputEnabled
  // is used correctly, but this is a cheap safety net)
  if (!GameState.isValidMove(board, col)) return;

  // ── 1. Apply the player's move ────────────────────────────────────
  //
  // dropPiece() returns a result object:
  //   { row, col, board }
  //   row   = the row the piece landed on (needed for animation + logging)
  //   board = a NEW board array (original is untouched — see gameState.js)
  //
  const result = GameState.dropPiece(board, col, GameState.PLAYER);

  // Replace the live board reference with the updated one
  board = result.board;
  turnCount++;

  // ── 2. Render ─────────────────────────────────────────────────────
  UI.renderBoard(board);
  UI.animateDrop(result.row, result.col);
  UI.setTurnCount(turnCount);
  Visualizer.logPlayerMove(result.col, result.row);

  // ── 3. Check for player win ───────────────────────────────────────
  const playerWin = GameState.checkWin(board, GameState.PLAYER);
  if (playerWin) {
    endGame('player', playerWin);
    return;
  }

  // ── 4. Check for draw ─────────────────────────────────────────────
  if (GameState.isBoardFull(board)) {
    endGame('draw', null);
    return;
  }

  // ── 5. Hand off to AI ─────────────────────────────────────────────
  currentPlayer = GameState.AI;
  UI.setInputEnabled(false);         // lock the board during AI turn
  UI.setStatus('A.I. PROCESSING...');

  // Outer delay — gives the browser a render cycle to show the player's
  // drop animation and the "A.I. PROCESSING..." status before we block.
  setTimeout(() => {

    // Log the opening analysis line BEFORE the heavy computation starts.
    // Because JS is single-threaded, the DOM won't actually repaint until
    // after this entire callback returns — but the inner setTimeout below
    // creates a second task, giving the browser one more render cycle so
    // "EVALUATING DEPTH N..." appears in the log while Minimax is running.
    Visualizer.logAIThinking(currentDepth);

    // Inner zero delay — lets "EVALUATING..." paint before Minimax blocks
    setTimeout(() => {
      const { column, stats, rootBoard, columnScores, principalVariation } = AI_ENGINE.getBestMove(board, currentDepth);

      // Push the stat readouts and the four-line analysis log
      Visualizer.updateStats({
        nodes:  stats.nodesEvaluated,
        depth:  stats.depth,
        pruned: stats.branchesPruned,
        score:  stats.score,
      });
      Visualizer.logAIDecision(stats, column);

      // Render the decision tree canvas (canvas.js)
      TREE_CANVAS.renderTree({ rootBoard, columnScores, principalVariation, chosenCol: column });

      executeAIMove(column);
    }, 0);

  }, 50);
}


// ─────────────────────────────────────────────
// GAME LOOP — AI TURN
// ─────────────────────────────────────────────

/**
 * Applies the AI's chosen column to the board and checks for a terminal state.
 *
 * In Phase 2 this function will be called by the Minimax module
 * (via the PHASE 2 HOOK above) with the algorithm's optimal column.
 * The function itself does not change — only its caller changes.
 *
 * @param {number} col  0-indexed column chosen by the AI
 */
function executeAIMove(col) {
  const result = GameState.dropPiece(board, col, GameState.AI);
  board = result.board;
  turnCount++;

  UI.renderBoard(board);
  UI.animateDrop(result.row, result.col);
  UI.setTurnCount(turnCount);
  Visualizer.logAIMove(result.col, result.row);

  // ── Check for AI win ──────────────────────────────────────────────
  const aiWin = GameState.checkWin(board, GameState.AI);
  if (aiWin) {
    endGame('ai', aiWin);
    return;
  }

  // ── Check for draw ────────────────────────────────────────────────
  if (GameState.isBoardFull(board)) {
    endGame('draw', null);
    return;
  }

  // ── Return control to the player ──────────────────────────────────
  currentPlayer = GameState.PLAYER;
  UI.setInputEnabled(true, GameState.getValidColumns(board));
  UI.setStatus('YOUR MOVE — SELECT A COLUMN');
}


// ─────────────────────────────────────────────
// TERMINAL STATE
// ─────────────────────────────────────────────

/**
 * Handles any terminal game state (win for either side, or draw).
 *
 * @param {'player'|'ai'|'draw'}              winner    Who won, or 'draw'
 * @param {Array<{row:number,col:number}>|null} winCells  The 4 winning cells, or null
 */
function endGame(winner, winCells) {
  gameOver = true;

  // Disable all input — game is finished
  UI.setInputEnabled(false);

  // Visually mark the winning streak (no-op for a draw)
  if (winCells) UI.highlightWin(winCells);

  const statusMessages = {
    player : 'PLAYER WINS — EXPERIMENT COMPLETE',
    ai     : 'A.I. WINS — EXPERIMENT COMPLETE',
    draw   : 'DRAW — BOARD CAPACITY REACHED',
  };

  UI.setStatus(statusMessages[winner]);
  Visualizer.logGameEnd(winner);
}


// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

// Wait for the full HTML to parse before touching the DOM.
document.addEventListener('DOMContentLoaded', initGame);
