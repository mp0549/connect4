/**
 * ai.js — Minimax AI Engine with Alpha-Beta Pruning
 * ──────────────────────────────────────────────────
 * Pure decision-making logic for the AI player.
 * No DOM access, no side effects — reads boards and returns decisions.
 *
 * Public API (one function):
 *   AI_ENGINE.getBestMove(board, depth)
 *   → {
 *       column:             number,
 *       rootBoard:          number[][],
 *       columnScores:       Array<{col, valid, score, board}>,
 *       principalVariation: Array<{col, board}>,
 *       stats:              {nodesEvaluated, branchesPruned, depth, score}
 *     }
 *
 * Dependencies (loaded before this file):
 *   GameState     — board logic, constants
 *   AI_HEURISTIC  — scoreWindow(), evaluateBoard()
 *
 * ── Algorithm overview ────────────────────────────────────────────────────
 *
 * MINIMAX:
 *   The AI imagines a game tree. Each node is a board state. Each edge is
 *   a move. The AI explores all possible move sequences up to a fixed depth,
 *   then scores the leaf boards with a heuristic. It propagates scores back
 *   up the tree: "maximizing" nodes (AI's turn) pick the highest-score child;
 *   "minimizing" nodes (player's turn) pick the lowest-score child.
 *   This assumes the opponent always plays optimally.
 *
 * ALPHA-BETA PRUNING:
 *   A massive optimization layered on top of Minimax that cuts branches we
 *   can prove will never be chosen. We track two values:
 *     alpha = the best score the maximizer (AI) is guaranteed so far
 *     beta  = the best score the minimizer (player) is guaranteed so far
 *   If beta ≤ alpha, the current branch can be abandoned ("pruned") because:
 *     - The minimizer already has a path that's at most `beta`
 *     - The maximizer already has a path that's at least `alpha`
 *     - No further exploration can change either player's optimal choice
 *   With good move ordering, Alpha-Beta can reduce O(b^d) to O(b^(d/2)),
 *   effectively doubling the searchable depth for the same compute budget.
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
   * Default Minimax search depth (half-moves / plies ahead).
   * Each ply = one player's turn. Depth 7 means 7 turns looked ahead.
   * Raise for stronger (slower) play; lower for faster (weaker) play.
   */
  const MAX_DEPTH = 7;

  /**
   * Terminal state scores. Large finite numbers rather than ±Infinity
   * because we add/subtract `depth` to prefer faster wins / slower losses.
   * (Infinity ± anything = Infinity, which breaks that adjustment.)
   *
   * The heuristic's max score is roughly 700 (69 windows × ~10 each),
   * so 1,000,000 is safely unreachable by heuristic evaluation.
   */
  const SCORE_WIN  =  1_000_000;
  const SCORE_LOSS = -1_000_000;

  /**
   * Column evaluation order: center columns first.
   * Evaluating strong moves early gives Alpha-Beta better bounds to
   * prune with, dramatically reducing nodes visited.
   */
  const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];


  // ─────────────────────────────────────────────
  // STATS TRACKING  (reset on every getBestMove call)
  // ─────────────────────────────────────────────

  /** Total minimax nodes visited. Exposed in stats for the visualizer. */
  let nodesEvaluated = 0;

  /** Total branches cut by alpha-beta. Exposed in stats for the visualizer. */
  let branchesPruned = 0;


  // ─────────────────────────────────────────────
  // MINIMAX WITH ALPHA-BETA PRUNING
  // ─────────────────────────────────────────────

  /**
   * Recursively explores the game tree and returns the best score
   * achievable from this board state.
   *
   * @param {number[][]} board          Current board to evaluate
   * @param {number}     depth          Remaining search depth (counts down to 0)
   * @param {number}     alpha          Best score MAX player is guaranteed (−∞→∞)
   * @param {number}     beta           Best score MIN player is guaranteed (∞→−∞)
   * @param {boolean}    isMaximizing   true = AI's turn, false = player's turn
   * @returns {number}  Minimax value of this board from AI's perspective
   *
   * Depth-adjusted terminal scores:
   *   • Prefer FASTER wins   (more depth remaining = win sooner = higher score)
   *   • Delay   SLOWER losses (less depth remaining = loss later = less negative)
   */
  function minimax(board, depth, alpha, beta, isMaximizing) {
    nodesEvaluated++;

    // Terminal state checks — order matters: win > draw > depth
    if (GameState.checkWin(board, GameState.AI))     return SCORE_WIN  + depth;
    if (GameState.checkWin(board, GameState.PLAYER)) return SCORE_LOSS - depth;
    if (GameState.isBoardFull(board))                return 0;
    if (depth === 0) return AI_HEURISTIC.evaluateBoard(board);

    const validCols = COLUMN_ORDER.filter(col => GameState.isValidMove(board, col));

    if (isMaximizing) {
      let maxScore = -Infinity;

      for (const col of validCols) {
        const result = GameState.dropPiece(board, col, GameState.AI);
        const score  = minimax(result.board, depth - 1, alpha, beta, false);

        maxScore = Math.max(maxScore, score);
        alpha    = Math.max(alpha, score);

        if (beta <= alpha) { branchesPruned++; break; }
      }

      return maxScore;

    } else {
      let minScore = Infinity;

      for (const col of validCols) {
        const result = GameState.dropPiece(board, col, GameState.PLAYER);
        const score  = minimax(result.board, depth - 1, alpha, beta, true);

        minScore = Math.min(minScore, score);
        beta     = Math.min(beta, score);

        if (beta <= alpha) { branchesPruned++; break; }
      }

      return minScore;
    }
  }


  // ─────────────────────────────────────────────
  // PRINCIPAL VARIATION TRACE
  // ─────────────────────────────────────────────

  /**
   * After the main search picks bestCol, trace the predicted sequence of
   * subsequent optimal moves — the "Principal Variation" (PV).
   *
   * Each entry in the returned array includes both the column chosen and the
   * resulting board state after that move, so the canvas renderer can draw
   * mini-board thumbnails of each projected future position.
   *
   * Called with the board AFTER the AI has already played bestCol.
   * Uses a shallow search (depth 2) so it runs almost instantly.
   *
   * NOTE: This increments the shared nodesEvaluated / branchesPruned counters.
   * The caller must save and restore those counters to hide PV cost from stats.
   *
   * @param {number[][]} board      Board state after AI's chosen move
   * @param {number}     maxMoves   Maximum subsequent moves to predict
   * @param {number}     mainDepth  The original search depth (used to scale pvDepth)
   * @returns {Array<{col: number, board: number[][]}>}
   *   Each element is the column played and the board state AFTER that move.
   */
  function tracePrincipalVariation(board, maxMoves, mainDepth) {
    const pv = [];

    if (GameState.checkWin(board, GameState.AI) || GameState.isBoardFull(board)) {
      return pv;
    }

    let currentBoard = board;
    let isPlayerTurn = true; // player responds to AI's bestCol move first

    for (let i = 0; i < maxMoves; i++) {
      const player    = isPlayerTurn ? GameState.PLAYER : GameState.AI;
      const validCols = COLUMN_ORDER.filter(col => GameState.isValidMove(currentBoard, col));
      if (validCols.length === 0) break;

      const pvDepth = Math.min(2, Math.max(0, mainDepth - 3));

      let bestPVScore = isPlayerTurn ? Infinity : -Infinity;
      let bestPVCol   = validCols[0];

      for (const col of validCols) {
        const result = GameState.dropPiece(currentBoard, col, player);

        if (GameState.checkWin(result.board, player)) {
          bestPVCol   = col;
          bestPVScore = isPlayerTurn ? SCORE_LOSS : SCORE_WIN;
          break;
        }

        const score = pvDepth > 0
          ? minimax(result.board, pvDepth - 1, -Infinity, Infinity, isPlayerTurn)
          : AI_HEURISTIC.evaluateBoard(result.board);

        if (isPlayerTurn ? score < bestPVScore : score > bestPVScore) {
          bestPVScore = score;
          bestPVCol   = col;
        }
      }

      // Apply the chosen move and capture the resulting board state.
      // pv entries carry the board so the canvas can draw mini-board thumbnails.
      const pvResult = GameState.dropPiece(currentBoard, bestPVCol, player);
      currentBoard   = pvResult.board;
      pv.push({ col: bestPVCol, board: currentBoard });

      if (GameState.checkWin(currentBoard, player) || GameState.isBoardFull(currentBoard)) break;
      isPlayerTurn = !isPlayerTurn;
    }

    return pv;
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * Finds the best column for the AI to play, given the current board state.
   * The only public function — main.js calls this once per AI turn.
   *
   * Runs a root-level Minimax loop (one level above the recursive minimax()
   * function) so we can both track which column produced the best score AND
   * capture the board state after each hypothetical root move (needed for
   * the canvas decision-tree mini-board thumbnails).
   *
   * @param {number[][]} board  The current game board (NOT mutated)
   * @param {number}     depth  Minimax search depth (defaults to MAX_DEPTH)
   * @returns {{
   *   column:             number,
   *   rootBoard:          number[][],
   *   columnScores:       Array<{col:number, valid:boolean, score:number|null, board:number[][]|null}>,
   *   principalVariation: Array<{col:number, board:number[][]}>,
   *   stats:              {nodesEvaluated:number, branchesPruned:number, depth:number, score:number}
   * }}
   */
  function getBestMove(board, depth = MAX_DEPTH) {
    nodesEvaluated = 0;
    branchesPruned = 0;

    let bestScore = -Infinity;
    let bestCol   = COLUMN_ORDER.find(col => GameState.isValidMove(board, col));

    // Build the full 7-column score+board map (null values = invalid / full column).
    // Indexed by actual column number so the canvas renderer can address by col.
    const allColumnScores = Array.from({ length: 7 }, (_, col) => ({
      col,
      valid: GameState.isValidMove(board, col),
      score: null,
      board: null,   // populated to result.board for each valid column
    }));

    const validCols = COLUMN_ORDER.filter(col => GameState.isValidMove(board, col));

    for (const col of validCols) {
      // Simulate AI dropping a piece — dropPiece() returns a NEW board.
      const result = GameState.dropPiece(board, col, GameState.AI);

      // After AI moves, player's turn next → minimizing; depth already counts this ply.
      const score = minimax(result.board, depth - 1, -Infinity, Infinity, false);

      allColumnScores[col].score = score;
      allColumnScores[col].board = result.board; // board AFTER AI drops in this col

      if (score > bestScore) {
        bestScore = score;
        bestCol   = col;
      }
    }

    // ── Trace the Principal Variation ─────────────────────────────────────
    // After picking bestCol, follow the predicted optimal sequence a few
    // moves deeper. Purely for the canvas visualizer — does not affect the
    // AI's choice. Save and restore counters so PV trace is invisible to stats.

    const savedNodes  = nodesEvaluated;
    const savedPruned = branchesPruned;

    const chosenResult       = GameState.dropPiece(board, bestCol, GameState.AI);
    const principalVariation = tracePrincipalVariation(chosenResult.board, 3, depth);

    nodesEvaluated = savedNodes;
    branchesPruned = savedPruned;

    return {
      column: bestCol,
      rootBoard: board,           // board BEFORE AI moves — used as canvas tree root
      columnScores: allColumnScores,
      principalVariation,         // Array<{col, board}> — board state AFTER each move
      stats: {
        nodesEvaluated,
        branchesPruned,
        depth,
        score: bestScore,
      },
    };
  }


  // ─────────────────────────────────────────────
  // EXPOSED PUBLIC INTERFACE
  // ─────────────────────────────────────────────

  return { getBestMove };

})();
