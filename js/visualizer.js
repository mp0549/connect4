/**
 * visualizer.js — Terminal Panel Module
 * ──────────────────────────────────────
 * Owns the right-hand panel: the four stat readouts and the scrollable
 * event log. Handles all text-based visualization (log entries, stat boxes).
 *
 * Canvas / decision-tree rendering lives in canvas.js (TREE_CANVAS).
 *
 * This module reads DOM nodes on load and caches them. It does NOT
 * import from gameState.js — it only receives plain values as arguments.
 */

const Visualizer = (() => {

  // ─────────────────────────────────────────────
  // DOM REFERENCES  (cached once at module init)
  // ─────────────────────────────────────────────

  const logEl       = document.getElementById('vis-log');
  const statNodes   = document.getElementById('stat-nodes');
  const statDepth   = document.getElementById('stat-depth');
  const statPruned  = document.getElementById('stat-pruned');
  const statScore   = document.getElementById('stat-score');


  // ─────────────────────────────────────────────
  // INTERNAL STATE
  // ─────────────────────────────────────────────

  /**
   * Move counter used to generate the T+XX timestamp shown in each
   * log entry. Incremented by logPlayerMove() and logAIMove().
   * Reset to 0 by clearLog().
   */
  let moveCounter = 0;


  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  /**
   * Creates and appends a single entry to the log panel.
   *
   * Each entry is a two-column div:
   *   [T+XX]  [message text]
   *
   * The `type` argument drives a CSS modifier class that controls color:
   *   'player' → bold black   (human move)
   *   'ai'     → bold red     (AI move)
   *   'system' → muted italic (state changes, resets, etc.)
   *   'win'    → bold black + wide tracking (result announcement)
   *
   * @param {string} message
   * @param {'player'|'ai'|'system'|'win'} type
   */
  function appendLog(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-entry--${type}`;

    // Timestamp column — zero-padded to 2 digits, e.g. "T+07"
    const ts = document.createElement('span');
    ts.className   = 'log-timestamp';
    ts.textContent = `T+${String(moveCounter).padStart(2, '0')}`;

    // Message column
    const msg = document.createElement('span');
    msg.className   = 'log-message';
    msg.textContent = message;

    entry.appendChild(ts);
    entry.appendChild(msg);
    logEl.appendChild(entry);

    // Keep the latest entry in view automatically
    logEl.scrollTop = logEl.scrollHeight;
  }

  /**
   * Converts a 0-indexed column number to a letter label (A–G).
   * Used to make log messages human-readable.
   *
   * @param   {number} col  0-indexed
   * @returns {string}      'A' through 'G'
   */
  function colLabel(col) {
    return String.fromCharCode(65 + col); // 65 = char code of 'A'
  }


  // ─────────────────────────────────────────────
  // PUBLIC — LOG METHODS
  // ─────────────────────────────────────────────

  /**
   * Logs the game-start event. Should be called once per new game
   * after clearLog() and resetStats() have been called.
   */
  function logGameStart() {
    appendLog('SYSTEM ONLINE. PLAYER TO MOVE.', 'system');
  }

  /**
   * Logs a move made by the human player.
   *
   * @param {number} col  0-indexed column chosen by the player
   * @param {number} row  0-indexed row where the piece landed
   */
  function logPlayerMove(col, row) {
    moveCounter++;
    // Display in 1-indexed, human-readable format
    appendLog(`PLAYER → COL ${colLabel(col)}  [R${row + 1} C${col + 1}]`, 'player');
  }

  /**
   * Logs a move made by the AI.
   *
   * @param {number} col  0-indexed column the AI chose
   * @param {number} row  0-indexed row where the piece landed
   */
  function logAIMove(col, row) {
    moveCounter++;
    appendLog(`A.I.   → COL ${colLabel(col)}  [R${row + 1} C${col + 1}]`, 'ai');
  }

  /**
   * Logs the opening line of the AI's analysis block — called BEFORE
   * getBestMove() runs, so it appears in the log while the AI is thinking.
   *
   * @param {number} depth  The search depth being used this turn
   */
  function logAIThinking(depth) {
    appendLog(`SYS: EVALUATING DEPTH ${depth}...`, 'analysis');
  }

  /**
   * Logs the four diagnostic lines that follow the AI's decision.
   * Called AFTER getBestMove() returns, with the real stats it produced.
   *
   * Format:
   *   NODES CHECKED:   4,392
   *   BRANCHES PRUNED: 1,840
   *   OUTCOME SCORE:   +120
   *   ACTION: POURING REAGENT IN TUBE 4
   *
   * @param {{ nodesEvaluated: number, branchesPruned: number, score: number }} stats
   * @param {number} col  0-indexed column the AI chose
   */
  function logAIDecision(stats, col) {
    // Format the score: show +/- for normal values, flag terminal states
    let scoreStr;
    if      (stats.score >=  999_000) scoreStr = '> WIN DETECTED';
    else if (stats.score <= -999_000) scoreStr = '< LOSS PROJECTED';
    else scoreStr = (stats.score > 0 ? '+' : '') + stats.score.toLocaleString();

    appendLog(`NODES CHECKED:   ${stats.nodesEvaluated.toLocaleString()}`, 'analysis');
    appendLog(`BRANCHES PRUNED: ${stats.branchesPruned.toLocaleString()}`, 'analysis');
    appendLog(`OUTCOME SCORE:   ${scoreStr}`, 'analysis');
    appendLog(`ACTION: POURING REAGENT IN TUBE ${col + 1}`, 'ai');
  }

  /**
   * Logs the terminal game result.
   *
   * @param {'player'|'ai'|'draw'} winner
   */
  function logGameEnd(winner) {
    const messages = {
      player : 'RESULT: PLAYER WINS. EXPERIMENT CONCLUDED.',
      ai     : 'RESULT: A.I. WINS. EXPERIMENT CONCLUDED.',
      draw   : 'RESULT: DRAW — BOARD CAPACITY REACHED.',
    };
    appendLog(messages[winner] ?? 'RESULT: GAME OVER.', 'win');
  }

  /**
   * Logs a generic system message (resets, clears, etc.).
   *
   * @param {string} message
   */
  function logSystem(message) {
    appendLog(message, 'system');
  }


  // ─────────────────────────────────────────────
  // PUBLIC — STAT READOUTS
  // ─────────────────────────────────────────────

  /**
   * Updates the four stat display boxes in the visualizer panel.
   *
   * In Phase 1 these remain "—" throughout the game. In Phase 2 the AI
   * module will call this after each Minimax search with real values.
   *
   * Pass a property as null (or omit it) to display "—".
   *
   * @param {object}      stats
   * @param {number|null} stats.nodes   Total nodes the algorithm evaluated
   * @param {number|null} stats.depth   Maximum depth searched
   * @param {number|null} stats.pruned  Branches cut by alpha-beta pruning
   * @param {number|null} stats.score   Heuristic score of the chosen move
   */
  function updateStats({ nodes = null, depth = null, pruned = null, score = null } = {}) {
    statNodes.textContent  = nodes  !== null ? nodes.toLocaleString()  : '—';
    statDepth.textContent  = depth  !== null ? String(depth)           : '—';
    statPruned.textContent = pruned !== null ? pruned.toLocaleString() : '—';

    // Score: prefix + for positive, flag terminal win/loss values
    if (score === null) {
      statScore.textContent = '—';
    } else if (score >=  999_000) {
      statScore.textContent = 'WIN';
    } else if (score <= -999_000) {
      statScore.textContent = 'LOSS';
    } else {
      statScore.textContent = (score > 0 ? '+' : '') + score.toLocaleString();
    }
  }

  /**
   * Convenience wrapper: resets all four stats to "—".
   * Called at the start of each new game.
   */
  function resetStats() {
    updateStats(); // all params default to null → all display "—"
  }


  // ─────────────────────────────────────────────
  // PUBLIC — LOG MANAGEMENT
  // ─────────────────────────────────────────────

  /**
   * Wipes all entries from the log panel and resets the move counter.
   * Called on game reset and when the user clicks the "CLEAR" button.
   */
  function clearLog() {
    logEl.innerHTML = '';
    moveCounter = 0;
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return {
    logGameStart,
    logPlayerMove,
    logAIMove,
    logAIThinking,
    logAIDecision,
    logGameEnd,
    logSystem,
    updateStats,
    resetStats,
    clearLog,
  };

})();
