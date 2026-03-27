/**
 * ai.js — Minimax AI Engine with Alpha-Beta Pruning
 * ──────────────────────────────────────────────────
 * This module contains the pure decision-making math for the AI player.
 * It has NO DOM access and NO side effects — it only reads boards and
 * returns decisions.
 *
 * Public API (one function):
 *   AI_ENGINE.getBestMove(board)
 *   → { column: number, stats: { nodesEvaluated, branchesPruned, depth, score } }
 *
 * Dependency: GameState (loaded before this file in index.html).
 * Uses GameState.dropPiece() exclusively for all board manipulation, which
 * guarantees immutability — the original board is NEVER mutated.
 *
 * ── Algorithm overview ────────────────────────────────────────────────────
 *
 * MINIMAX:
 *   The AI imagines a game tree. Each node is a board state. Each edge is
 *   a move. The AI explores all possible move sequences up to a fixed depth,
 *   then scores the leaf boards with a heuristic. It propagates scores back
 *   up the tree: "maximizing" nodes (AI's turn) pick the child with the
 *   highest score; "minimizing" nodes (player's turn) pick the child with
 *   the lowest score. This assumes the opponent always plays optimally.
 *
 * ALPHA-BETA PRUNING:
 *   A massive optimization layered on top of Minimax that cuts branches we
 *   can prove will never be chosen. We track two values:
 *     alpha = the best score the maximizer (AI) is guaranteed so far
 *     beta  = the best score the minimizer (player) is guaranteed so far
 *   If beta ≤ alpha, the current branch can be abandoned ("pruned") because:
 *     - The minimizer already has a path that's at most `beta`
 *     - The maximizer already has a path that's at least `alpha`
 *     - No further exploration here can change either player's optimal choice
 *   With good move ordering, Alpha-Beta can reduce O(b^d) to O(b^(d/2)),
 *   effectively doubling the search depth for the same computation budget.
 *
 * MOVE ORDERING:
 *   We always evaluate center columns first. Center pieces participate in
 *   more potential 4-in-a-row windows than edge pieces, so center moves
 *   tend to be strong. Evaluating good moves first makes Alpha-Beta prune
 *   more aggressively, since it finds a high alpha/low beta bound early.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

const AI_ENGINE = (() => {

  // ─────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────

  /**
   * How many half-moves (plies) ahead the AI searches.
   * Each ply = one player's turn. Depth 7 means the AI looks 7 turns ahead
   * (4 AI moves, 3 player moves, or vice versa depending on who starts).
   *
   * Tradeoff: higher depth = stronger play, but exponentially more nodes.
   * With Alpha-Beta pruning, depth 7 is fast enough for real-time play.
   * Raise to 9 for a stronger (slower) AI; lower to 5 for a faster (weaker) one.
   */
  const MAX_DEPTH = 7;

  /**
   * Terminal state scores. We use large finite numbers rather than ±Infinity
   * because we add/subtract `depth` to prefer faster wins and slower losses
   * (Infinity ± anything is still Infinity, which would break that logic).
   *
   * The values just need to be larger than any heuristic score could ever be.
   * With 42 cells and a max heuristic of ~10 points per window × ~69 windows
   * ≈ 700 max heuristic score, 1,000,000 is safely unreachable by the heuristic.
   */
  const SCORE_WIN  =  1_000_000;
  const SCORE_LOSS = -1_000_000;

  /**
   * Column evaluation order: center columns first.
   *
   * Why: In Connect 4, column 3 (the center) participates in 3× more
   * potential winning 4-in-a-row lines than columns 0 or 6. By evaluating
   * strong moves first, Alpha-Beta prunes weak branches earlier, dramatically
   * reducing the total nodes visited.
   *
   * This array is a fixed permutation of [0..6] sorted by distance from center.
   * It works for any standard 7-column board.
   */
  const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];


  // ─────────────────────────────────────────────
  // STATS TRACKING  (reset on every getBestMove call)
  // ─────────────────────────────────────────────

  /**
   * Total minimax nodes visited. Incremented once at the top of every
   * minimax() call, including terminal nodes and leaf evaluations.
   * Exposed in stats so the visualizer can display it.
   * @type {number}
   */
  let nodesEvaluated = 0;

  /**
   * Total branches pruned. Incremented each time a beta ≤ alpha cutoff
   * causes us to break out of a loop early.
   * @type {number}
   */
  let branchesPruned = 0;


  // ─────────────────────────────────────────────
  // HEURISTIC — WINDOW SCORING
  // ─────────────────────────────────────────────

  /**
   * Scores a single "window" of exactly 4 consecutive cells from the
   * AI's perspective. A positive return value means the window favors AI;
   * negative means it favors the player.
   *
   * ── Why windows? ──────────────────────────────────────────────────────
   * The board has 69 possible 4-in-a-row lines (24 horizontal + 21 vertical
   * + 12 diagonal↘ + 12 diagonal↗). Every such line is a window.
   * By scoring each window and summing them all, we get a board score that
   * captures both immediate threats and long-term positioning simultaneously.
   *
   * ── Scoring rationale ─────────────────────────────────────────────────
   * Score values are intentionally ordered so the AI treats blocking an
   * opponent's three-in-a-row as more urgent than building its own two-in-a-row.
   *
   *   +50  own 3 + 1 empty  — one move away from winning; very high value
   *   +10  own 2 + 2 empty  — developing position
   *   -80  opponent 3+1     — block immediately (weighted heavier than own +50
   *                           so the AI doesn't miss threats while attacking)
   *    -5  opponent 2+2     — mild concern
   *     0  mixed window     — both players have pieces; window is dead
   *
   * @param {number[]} window  Exactly 4 cell values (EMPTY, PLAYER, or AI)
   * @param {number}   player  The "friendly" player (always GameState.AI here)
   * @returns {number}
   */
  function scoreWindow(window, player) {
    const opponent = (player === GameState.AI) ? GameState.PLAYER : GameState.AI;

    // Count each type of occupant in this 4-cell window
    let playerCount   = 0;
    let opponentCount = 0;
    let emptyCount    = 0;

    for (const cell of window) {
      if      (cell === player)   playerCount++;
      else if (cell === opponent) opponentCount++;
      else                        emptyCount++;
    }

    // A window where BOTH players have pieces is blocked — it can never become
    // a 4-in-a-row for either side. Score it 0 to save the branching below.
    if (playerCount > 0 && opponentCount > 0) return 0;

    // Favorable window patterns (from AI's perspective)
    if (playerCount === 4)                       return  100;  // complete win (normally caught by checkWin first)
    if (playerCount === 3 && emptyCount === 1)   return   50;  // one move from win
    if (playerCount === 2 && emptyCount === 2)   return   10;  // developing

    // Threatening window patterns (opponent is about to win)
    if (opponentCount === 3 && emptyCount === 1) return  -80;  // must block
    if (opponentCount === 2 && emptyCount === 2) return   -5;  // mild threat

    return 0; // single-piece or fully empty windows — negligible value
  }


  // ─────────────────────────────────────────────
  // HEURISTIC — FULL BOARD EVALUATION
  // ─────────────────────────────────────────────

  /**
   * Assigns a numeric score to a board state from the AI's perspective.
   * Called at depth=0 leaf nodes (or draws) when the game isn't over yet.
   *
   * ── Structure ─────────────────────────────────────────────────────────
   * 1. Center column bonus — rewards occupying the most strategically
   *    valuable column before the window scoring captures the full picture.
   * 2. Horizontal windows — all rows, left-to-right
   * 3. Vertical windows — all columns, top-to-bottom
   * 4. Diagonal ↘ windows — top-left to bottom-right
   * 5. Diagonal ↗ windows — bottom-left to top-right
   *
   * ── Center column bonus ───────────────────────────────────────────────
   * Column 3 (center) appears in more 4-in-a-row windows than any other
   * column. Each bonus point here gives the AI a nudge toward the center
   * in the early game before threats develop. Columns 2 and 4 also get
   * a smaller bonus for the same reason.
   *
   * @param {number[][]} board  The board to evaluate (never mutated)
   * @returns {number}  Positive = good for AI, negative = good for player
   */
  function evaluateBoard(board) {
    let score = 0;

    // ── 1. Center column bonus ──────────────────────────────────────────
    //
    // Columns and their "importance" weight (how many winning lines pass through):
    //   col 0: 3 lines    col 1: 5    col 2: 7    col 3: 9 (max)
    //   col 4: 7 lines    col 5: 5    col 6: 3
    //
    // We use a simplified bonus: col 3 = +4, cols 2&4 = +3, cols 1&5 = +2, cols 0&6 = +1.
    // (Exact window counts would be more precise, but this approximation
    // is sufficient to guide the AI toward center play in the opening.)

    const centerBonusMap = [1, 2, 3, 4, 3, 2, 1]; // index = column

    for (let col = 0; col < GameState.COLS; col++) {
      const bonus = centerBonusMap[col];
      if (bonus === 0) continue;
      for (let row = 0; row < GameState.ROWS; row++) {
        if      (board[row][col] === GameState.AI)     score += bonus;
        else if (board[row][col] === GameState.PLAYER) score -= bonus;
      }
    }

    // ── 2. Horizontal windows (→) ───────────────────────────────────────
    //
    // Slide a 4-cell window across each row. There are (COLS - 3) = 4
    // starting positions per row, giving 6 × 4 = 24 horizontal windows.

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
    //
    // Slide a 4-cell window down each column. There are (ROWS - 3) = 3
    // starting positions per column, giving 7 × 3 = 21 vertical windows.

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
    //
    // Starting positions: rows 0–2, cols 0–3 → 3 × 4 = 12 diagonal windows.
    // Each window steps +1 in both row and col.

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
    //
    // Starting positions: rows 3–5, cols 0–3 → 3 × 4 = 12 diagonal windows.
    // Each window steps -1 in row and +1 in col (going up-right).

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
  // MINIMAX WITH ALPHA-BETA PRUNING
  // ─────────────────────────────────────────────

  /**
   * The core search function. Recursively explores the game tree and
   * returns the best score achievable from this board state.
   *
   * ── Parameters ────────────────────────────────────────────────────────
   * @param {number[][]} board          Current board to evaluate
   * @param {number}     depth          Remaining search depth (counts down to 0)
   * @param {number}     alpha          Best score MAX player is guaranteed (−∞ → ∞)
   * @param {number}     beta           Best score MIN player is guaranteed (∞ → −∞)
   * @param {boolean}    isMaximizing   true = AI's turn, false = player's turn
   *
   * ── Returns ───────────────────────────────────────────────────────────
   * @returns {number}  The minimax value of this board from AI's perspective
   *
   * ── Depth-adjusted terminal scores ────────────────────────────────────
   * When the game is won/lost, we adjust by `depth` so the AI:
   *   • Prefers FASTER wins  (higher `depth` remaining = fewer moves played = win sooner)
   *   • Delays SLOWER losses (lower `depth` remaining = more moves played = loss later)
   *
   * Without this adjustment, the AI would treat "win in 1 move" and "win in
   * 5 moves" identically, and might make nonsensical choices between them.
   */
  function minimax(board, depth, alpha, beta, isMaximizing) {
    nodesEvaluated++; // count every node, including terminal/leaf nodes

    // ── Terminal state checks (order matters — win before draw before depth) ──

    // A win for either player is the most important terminal condition.
    // Adjust score by remaining depth to encourage faster wins / slower losses.
    if (GameState.checkWin(board, GameState.AI)) {
      return SCORE_WIN + depth;    // AI wins; more depth = sooner win = better
    }
    if (GameState.checkWin(board, GameState.PLAYER)) {
      return SCORE_LOSS - depth;   // AI loses; less depth = later loss = less bad
    }

    // Draw (board is full with no winner) → neutral score
    if (GameState.isBoardFull(board)) return 0;

    // Depth exhausted → evaluate the position statically with the heuristic.
    // We've searched as far as we're willing to; now guess the outcome.
    if (depth === 0) return evaluateBoard(board);

    // ── Get valid moves, sorted center-first for better pruning ───────────
    //
    // COLUMN_ORDER is our center-first permutation of [0..6].
    // We filter it to only include columns that are actually playable.
    // This preserves the center-first ordering while skipping full columns.
    const validCols = COLUMN_ORDER.filter(col => GameState.isValidMove(board, col));

    // ── Maximizing node: AI picks the move with the highest score ─────────
    if (isMaximizing) {
      let maxScore = -Infinity;

      for (const col of validCols) {
        // Simulate the AI dropping a piece here. dropPiece() returns a NEW
        // board — the original is never mutated. This is critical for correct
        // tree traversal (each branch gets its own independent board state).
        const result = GameState.dropPiece(board, col, GameState.AI);

        // Recurse: after AI moves, it's the player's turn (minimizing)
        const score = minimax(result.board, depth - 1, alpha, beta, false);

        maxScore = Math.max(maxScore, score);

        // Alpha = best score the maximizer has found so far on this path.
        // Update it if we found something better.
        alpha = Math.max(alpha, score);

        // Pruning condition: if beta ≤ alpha, the minimizer (player) already
        // has a guaranteed path that's at most `beta`. The maximizer has found
        // a path that's at least `alpha`. Since alpha ≥ beta, the minimizer
        // will NEVER choose to enter this subtree — they'll always pick their
        // guaranteed `beta` path instead. So we stop exploring here.
        if (beta <= alpha) {
          branchesPruned++;
          break; // ← the "cutoff"
        }
      }

      return maxScore;

    // ── Minimizing node: player picks the move with the lowest score ───────
    } else {
      let minScore = Infinity;

      for (const col of validCols) {
        // Simulate the player dropping a piece here.
        const result = GameState.dropPiece(board, col, GameState.PLAYER);

        // Recurse: after player moves, it's the AI's turn (maximizing)
        const score = minimax(result.board, depth - 1, alpha, beta, true);

        minScore = Math.min(minScore, score);

        // Beta = best score the minimizer has found so far on this path.
        // Update it if we found something worse (for the maximizer).
        beta = Math.min(beta, score);

        // Pruning condition: symmetric to the maximizing case.
        // If beta ≤ alpha, the maximizer (AI) already has a guaranteed path
        // that's at least `alpha`. The minimizer can't do better than `beta`
        // from here. Since beta ≤ alpha, the maximizer will never choose
        // to enter this subtree. Cut it off.
        if (beta <= alpha) {
          branchesPruned++;
          break; // ← the "cutoff"
        }
      }

      return minScore;
    }
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * Finds the best column for the AI to play, given the current board state.
   *
   * This is the only public function. main.js calls this once per AI turn.
   * It runs a root-level Minimax search (one level above the recursive
   * minimax() function) so we can track which column produced the best score.
   *
   * ── Why not just call minimax() at the root? ──────────────────────────
   * minimax() returns a score but not the column that produced it. We need
   * the column to actually make the move. The root loop below is a manual
   * "maximizing node" that also tracks the best column index.
   *
   * ── Alpha-Beta initialization ──────────────────────────────────────────
   * We pass −∞ and +∞ as the initial alpha and beta. This means "no
   * guarantees yet" — the bounds will tighten as we explore moves.
   *
   * @param {number[][]} board  The current game board (NOT mutated)
   * @returns {{
   *   column: number,
   *   stats: {
   *     nodesEvaluated: number,
   *     branchesPruned: number,
   *     depth: number,
   *     score: number
   *   }
   * }}
   */
  function getBestMove(board) {
    // Reset per-search counters
    nodesEvaluated = 0;
    branchesPruned = 0;

    let bestScore = -Infinity;

    // Default to the first valid center-biased column in case all scores tie.
    // This avoids `bestCol` ever being undefined if the board is nearly full.
    let bestCol = COLUMN_ORDER.find(col => GameState.isValidMove(board, col));

    // Root-level move enumeration: try every valid column in center-first order
    const validCols = COLUMN_ORDER.filter(col => GameState.isValidMove(board, col));

    for (const col of validCols) {
      // AI makes a hypothetical move in this column
      const result = GameState.dropPiece(board, col, GameState.AI);

      // After AI moves, it's the player's turn → minimizing, depth - 1
      // We pass -Infinity/+Infinity because nothing has been explored yet.
      const score = minimax(
        result.board,
        MAX_DEPTH - 1,   // one ply already used by the root AI move above
        -Infinity,
        Infinity,
        false            // player's turn next (minimizing)
      );

      // Track the best column found so far
      if (score > bestScore) {
        bestScore = score;
        bestCol   = col;
      }
    }

    // Return the chosen column AND the stats for the visualizer panel
    return {
      column: bestCol,
      stats: {
        nodesEvaluated,
        branchesPruned,
        depth: MAX_DEPTH,
        score: bestScore,
      },
    };
  }


  // ─────────────────────────────────────────────
  // EXPOSED PUBLIC INTERFACE
  // ─────────────────────────────────────────────

  return {
    getBestMove,
  };

})();
