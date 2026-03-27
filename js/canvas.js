/**
 * canvas.js — A.I. Decision Tree Renderer
 * ─────────────────────────────────────────
 * Brutalist, data-dense decision-tree visualization drawn on #ai-tree-canvas.
 * Background is transparent — the site's CSS grid pattern shows through.
 *
 * Globals consumed: document, CANVAS_DRAW (canvasDraw.js)
 * Globals exposed:  TREE_CANVAS
 *
 * Public API:
 *   TREE_CANVAS.renderTree({ rootBoard, columnScores, principalVariation, chosenCol })
 *   TREE_CANVAS.clearTree()
 *
 * Visual language:
 *   ┌─────┐  Mini-board thumbnails (28×24 px, 4px cells)
 *   │ ▪ ▪ │  Player pieces = black, AI pieces = red, Empty = transparent
 *   └─────┘
 *   ━━━━━    thick black line   = optimal / chosen path
 *   ╌╌╌╌╌    thin dashed line   = evaluated alternative
 *   ╳        stark red cross    = pruned / losing branch
 *   [+067]   score annotation   = heuristic value label (below boards)
 *
 * Drawing primitives (drawLine, drawCross, drawNode, drawTelem, drawMiniBoard)
 * live in canvasDraw.js (CANVAS_DRAW) so this file stays focused on layout.
 */

const TREE_CANVAS = (() => {

  const canvasEl  = document.getElementById('ai-tree-canvas');
  const canvasCtx = canvasEl ? canvasEl.getContext('2d') : null;

  // Canvas height is fixed; width adapts to the rendered element size.
  const CANVAS_H = 580;

  // Convenience aliases — bind canvas context so call sites stay short.
  // All CANVAS_DRAW functions take ctx as their first argument.
  const ctx = canvasCtx;
  const dl  = (x1,y1,x2,y2, o)        => CANVAS_DRAW.drawLine     (ctx, x1,y1,x2,y2, o);
  const dc  = (x,y,sz, o)             => CANVAS_DRAW.drawCross    (ctx, x,y,sz, o);
  const dn  = (cx,cy,sc, o)           => CANVAS_DRAW.drawNode     (ctx, cx,cy,sc, o);
  const dt  = (x,y,tx, o)             => CANVAS_DRAW.drawTelem    (ctx, x,y,tx, o);
  const dmb = (cx,cy,board)           => CANVAS_DRAW.drawMiniBoard(ctx, cx,cy,board);


  // ─────────────────────────────────────────────
  // PUBLIC — renderTree
  // ─────────────────────────────────────────────

  /**
   * Draws the full decision tree for the AI's most recent move.
   *
   * Tree structure (vertical, top-to-bottom):
   *
   *   [ROOT BOARD]            current board state mini-board (top centre)
   *       │
   *   [A] [B] … [G]           7 branch mini-boards, one per column
   *                           chosen = thick line; pruned = ╳ overlay
   *
   *   (below chosen branch, straight down — "foresight tail"):
   *   [PLY BOARD]             board after predicted player response
   *   [A.I BOARD]             board after predicted AI counter-move
   *   [PLY BOARD]             board after second predicted player response
   *
   *   (below 2 decent alt columns — decorative depth+1 text nodes):
   *   [+045] / [−080]         shows search went deeper, lines were inferior
   *
   * @param {{
   *   rootBoard:          number[][],
   *   columnScores:       Array<{col:number, valid:boolean, score:number|null, board:number[][]|null}>,
   *   principalVariation: Array<{col:number, board:number[][]}>,
   *   chosenCol:          number
   * }} data
   */
  function renderTree({ rootBoard, columnScores, principalVariation, chosenCol }) {
    if (!canvasEl || !canvasCtx) return;

    // Sync drawing buffer to current CSS rendered width; clear to transparent.
    const W = Math.max(canvasEl.clientWidth, 400);
    canvasEl.width  = W;
    canvasEl.height = CANVAS_H;
    canvasCtx.clearRect(0, 0, W, CANVAS_H);

    // ── Layout constants ─────────────────────────────────────────────────────
    const cellW   = W / 7;
    const rootX   = W / 2;
    const rootY   = 65;   // root mini-board vertical centre
    const branchY = 175;  // branch mini-board vertical centres
    const pvStep  = 100;  // gap between successive PV mini-board centres

    // Horizontal centre for each of the 7 columns (0–6)
    const colX = Array.from({ length: 7 }, (_, i) => cellW * i + cellW / 2);

    // Score extremes — used to classify branches as "bad" vs "competitive"
    const validScores = columnScores
      .filter(c => c.valid && c.score !== null)
      .map(c => c.score);
    const maxScore = validScores.length ? Math.max(...validScores) : 0;

    // ── Header telemetry ─────────────────────────────────────────────────────
    dt(8,     14, 'DECISION_TREE_RENDER / ALPHA_BETA_PRUNED', { align: 'left',  color: '#ccc', size: 9 });
    dt(W - 8, 14, `BRANCHES_EVAL: ${validScores.length} / 7`,  { align: 'right', color: '#ccc', size: 9 });

    // ── Root mini-board ──────────────────────────────────────────────────────
    const rootBox = dmb(rootX, rootY, rootBoard);
    dt(rootX, rootBox.top - 7, 'CURRENT BOARD STATE', { color: '#aaa', size: 9 });

    // ── Branch lines and column mini-boards ──────────────────────────────────
    // boxes[col] stores the bounding box for each rendered branch node.
    // Used later for the PV tail and decorative sub-branches.
    const boxes = new Array(7).fill(null);

    columnScores.forEach(({ col, valid, score, board: colBoard }) => {
      const x        = colX[col];
      const isChosen = col === chosenCol;
      const isWin    = valid && score !== null && score >=  999_000;
      const isLoss   = valid && score !== null && score <= -999_000;
      const isBad    = !valid || (valid && score !== null && score < maxScore - 500);

      // ── Connecting line: root bottom → branch top ─────────────────────────
      dl(rootX, rootBox.bottom, x, branchY - 14, {
        color: isChosen ? '#1a1a1a' : (!valid ? '#eee' : isBad ? '#ddd' : '#999'),
        width: isChosen ? 2.5 : 0.75,
        dash:  isLoss ? [4, 3] : (isBad && valid ? [2, 3] : []),
      });

      // ── Column letter label above the board ───────────────────────────────
      dt(x, branchY - 14 - 8, `COL_${String.fromCharCode(65 + col)}`, {
        color: isChosen ? '#555' : (!valid ? '#e8e8e8' : '#bbb'),
        size:  9,
      });

      // ── Full column: just a faint × (no board to draw) ────────────────────
      if (!valid) {
        dc(x, branchY, 5, { color: '#dfdfdf', weight: 1 });
        dt(x, branchY + 14, 'COL_FULL', { color: '#e8e8e8', size: 8 });
        return;
      }

      // ── Branch mini-board ─────────────────────────────────────────────────
      const box = dmb(x, branchY, colBoard);
      boxes[col] = box;

      // ── × overlay for bad / losing branches ───────────────────────────────
      // Stamped over the mini-board to mark the branch as rejected.
      if (isLoss) {
        dc(x, branchY, 13, { color: '#cc1c1c', weight: 2 });
      } else if (isBad) {
        dc(x, branchY, 12, { color: '#ccc',    weight: 1.5 });
      }

      // ── Score annotation below the mini-board ─────────────────────────────
      const nodeColor = isChosen ? '#1a1a1a'
                      : isLoss   ? '#cc1c1c'
                      : isBad    ? '#ccc'
                      :            '#666';

      dn(x, box.bottom + 11, score, {
        bold:  isChosen,
        color: nodeColor,
        size:  isChosen ? 10 : 9,
      });

      // ── Telemetry: evaluation status below the score ───────────────────────
      const telemStr = isWin    ? 'TERMINAL / WIN_DETECTED'
                     : isLoss   ? 'TERMINAL / LOSS_PROJECTED'
                     : isChosen ? 'EVAL_COMPLETE / SELECTED'
                     : isBad    ? 'SYS_PRUNED / BELOW_THRESH'
                     :            'EVAL_COMPLETE';
      dt(x, box.bottom + 23, telemStr, {
        color: isChosen ? '#888' : '#d4d4d4',
        size:  isChosen ? 9 : 8,
      });
    });

    // ── PV "foresight" tail ──────────────────────────────────────────────────
    //
    // The Principal Variation is a vertical chain of mini-boards drawn directly
    // below the chosen branch, representing the AI's predicted future:
    //
    //   [chosen board]
    //        │  PLY_RESPONSE → COL_C
    //   [board after PLY]
    //        │  AI_COUNTER   → COL_D
    //   [board after A.I.]
    //        │  PLY_RESPONSE → COL_E
    //   [board after PLY]

    const chosenBox = boxes[chosenCol];
    if (chosenBox && principalVariation && principalVariation.length > 0) {
      const pvX          = colX[chosenCol];
      let   prevY        = chosenBox.bottom + 2; // 2px gap below chosen board
      const annoToRight  = pvX < W * 0.60;
      const annoX        = annoToRight ? pvX + 18 : pvX - 18;
      const annoAlign    = annoToRight ? 'left'   : 'right';
      const pvWhoLabels  = ['PLY_RESPONSE', 'AI_COUNTER', 'PLY_RESPONSE'];

      principalVariation.slice(0, 3).forEach((pv, i) => {
        if (!pv || pv.col === undefined || pv.col < 0 || pv.col > 6) return;

        const pvCy    = prevY + pvStep;
        const pvTop   = pvCy - 12; // top pixel of incoming mini-board (H/2 = 12)
        const isAI    = (i % 2 === 1); // 0=player, 1=AI, 2=player

        // ── Connecting line (prevY → just above next board) ──────────────────
        dl(pvX, prevY, pvX, pvTop - 2, {
          color: isAI ? '#1a1a1a' : '#888',
          width: isAI ? 2 : 1,
          dash:  isAI ? [] : [3, 2],
        });

        // ── Side annotation: who plays and which column ───────────────────────
        const midY = prevY + pvStep * 0.45;
        dt(annoX, midY,      pvWhoLabels[i],                              { align: annoAlign, color: '#bbb', size: 9 });
        dt(annoX, midY + 11, `→ COL_${String.fromCharCode(65 + pv.col)}`, { align: annoAlign, color: '#aaa', size: 9 });

        // ── PV mini-board ────────────────────────────────────────────────────
        const pvBox = dmb(pvX, pvCy, pv.board);

        // Role label below the PV board
        dt(pvX, pvBox.bottom + 9,
          isAI ? 'AI_MOVE_PREDICTED' : 'OPP_RESPONSE_EST',
          { color: '#ccc', size: 8 });

        prevY = pvBox.bottom + 2; // 2px gap above next connecting line
      });
    }

    // ── Decorative sub-branches ──────────────────────────────────────────────
    //
    // For up to 2 decent non-chosen branches, draw two child text nodes at
    // depth+1 to show the search went deeper and those lines were inferior.
    // Scores are deterministically derived from real scores (sin()) so the
    // same position always produces the same diagram — no Math.random().

    const altCols = columnScores
      .filter(c => c.valid && c.col !== chosenCol && c.score !== null
                && c.score >= maxScore - 500)
      .slice(0, 2);

    altCols.forEach(({ col, score }) => {
      const parent = boxes[col];
      if (!parent) return;

      const t1 = Math.abs(Math.sin(score * 0.137 + col * 1.3));
      const t2 = Math.abs(Math.sin(score * 0.537 + col * 2.1));

      const children = [
        { dx: -cellW * 0.40, delta: Math.round(t1 * 30  -  5) },
        { dx:  cellW * 0.40, delta: Math.round(t2 * 50  - 120) },
      ];

      children.forEach(({ dx, delta }) => {
        const cx = colX[col] + dx;
        const cy = parent.bottom + 72;
        if (cx < 6 || cx > W - 6) return;

        const childScore = score + delta;
        const isBadChild = childScore < maxScore - 600;

        dl(colX[col], parent.bottom, cx, cy - 10, {
          color: '#e2e2e2',
          width: 0.75,
          dash:  isBadChild ? [2, 3] : [],
        });

        dn(cx, cy, childScore, {
          color: isBadChild ? '#d4d4d4' : '#bbb',
          size:  10,
        });

        if (isBadChild) dc(cx, cy, 8, { color: '#ebebeb', weight: 1 });

        dt(cx, cy + 14, isBadChild ? 'SYS_PRUNED' : 'EVAL_DEPTH+1', { color: '#ddd', size: 8 });
      });
    });

    // ── Legend ───────────────────────────────────────────────────────────────
    dt(W - 8, CANVAS_H - 18,
      '━━ OPTIMAL   ╌╌ ALT   ╳ PRUNED   ┌─┐ BOARD_STATE',
      { align: 'right', color: '#ccc', size: 9 });
    dt(8, CANVAS_H - 18,
      'MINDREADER v3.4 / DECISION TREE',
      { align: 'left', color: '#ddd', size: 9 });
  }


  // ─────────────────────────────────────────────
  // PUBLIC — clearTree
  // ─────────────────────────────────────────────

  /**
   * Clears the canvas and shows a waiting-state placeholder.
   * Called on game reset before any AI move has been made.
   */
  function clearTree() {
    if (!canvasEl || !canvasCtx) return;
    const W = Math.max(canvasEl.clientWidth, 400);
    canvasEl.width  = W;
    canvasEl.height = CANVAS_H;
    canvasCtx.clearRect(0, 0, W, CANVAS_H);
    canvasCtx.font      = '12px "Courier New", monospace';
    canvasCtx.fillStyle = 'rgba(0,0,0,0.15)';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText('ANALYSIS PENDING — AWAIT A.I. TURN', W / 2, CANVAS_H / 2 - 4);
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return { renderTree, clearTree };

})();
