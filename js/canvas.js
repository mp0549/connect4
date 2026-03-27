/**
 * canvas.js — A.I. Decision Tree Renderer
 * ─────────────────────────────────────────
 * Brutalist, data-dense decision-tree visualization drawn on #ai-tree-canvas.
 * Background is transparent — the site's CSS grid pattern shows through.
 *
 * Globals consumed: document
 * Globals exposed:  TREE_CANVAS
 *
 * Public API:
 *   TREE_CANVAS.renderTree({ columnScores, principalVariation, chosenCol })
 *   TREE_CANVAS.clearTree()
 *
 * Visual language:
 *   [ +067 ]  bracket-label nodes (monospace, uppercase)
 *   ━━━━━      thick black line  = optimal/chosen path
 *   ╌╌╌╌╌      thin dashed line  = evaluated alternative
 *   ╳          stark red cross   = pruned / losing branch
 *   EVAL_COMPLETE / SYS_PRUNED / TERMINAL  telemetry annotations
 */

const TREE_CANVAS = (() => {

  const canvasEl  = document.getElementById('ai-tree-canvas');
  const canvasCtx = canvasEl ? canvasEl.getContext('2d') : null;

  // Canvas height is fixed; width adapts to the rendered element size.
  const CANVAS_H = 460;


  // ─────────────────────────────────────────────
  // SCORE FORMATTING
  // ─────────────────────────────────────────────

  /**
   * Converts a numeric score into a fixed-width bracket label.
   * All valid labels are designed to be the same visual width
   * in Courier New so the columns stay optically aligned.
   *
   *   null      → '[ ROOT ]'
   *   ≥ 999_000 → '[ WIN  ]'
   *   ≤−999_000 → '[ LOSS ]'
   *   67        → '[ +067 ]'
   *  −40        → '[ -040 ]'
   *
   * @param {number|null} score
   * @returns {string}
   */
  function fmtBracket(score) {
    if (score === null)    return '[ ROOT ]';
    if (score >=  999_000) return '[ WIN  ]';
    if (score <= -999_000) return '[ LOSS ]';
    const sign = score >= 0 ? '+' : '-';
    const abs  = String(Math.abs(score)).padStart(3, '0');
    return `[${sign}${abs}]`;
  }


  // ─────────────────────────────────────────────
  // DRAWING PRIMITIVES  (all use save/restore to prevent state leaks)
  // ─────────────────────────────────────────────

  /**
   * Draws a straight line from (x1,y1) to (x2,y2).
   */
  function drawLine(x1, y1, x2, y2, { color = '#aaa', width = 1, dash = [] } = {}) {
    const ctx = canvasCtx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a stark × at (x, y). Used for pruned and losing branches.
   */
  function drawCross(x, y, size, { color = '#cc1c1c', weight = 1.5 } = {}) {
    const ctx = canvasCtx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.strokeStyle = color;
    ctx.lineWidth   = weight;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws a bracket-label node — pure text, no circles.
   * Returns the bounding box for connecting lines.
   *
   * @param {number}      cx       Horizontal centre
   * @param {number}      cy       Vertical centre (baseline-middle)
   * @param {number|null} score    Score to format, or null for ROOT
   * @param {object}      opts
   * @param {boolean}     [opts.bold=false]
   * @param {string}      [opts.color='#1a1a1a']
   * @param {number}      [opts.size=9]         Font size in px
   * @param {string|null} [opts.label=null]     Override text (skips fmtBracket)
   * @returns {{ top, bottom, left, right, cx, cy }}
   */
  function drawNode(cx, cy, score, { bold = false, color = '#1a1a1a', size = 9, label = null } = {}) {
    const ctx  = canvasCtx;
    const text = label !== null ? label : fmtBracket(score);
    ctx.save();
    ctx.font         = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    const tw = ctx.measureText(text).width;
    ctx.restore();
    const hh = size * 0.65; // half-height estimate for Courier New
    return { top: cy - hh, bottom: cy + hh, left: cx - tw / 2, right: cx + tw / 2, cx, cy };
  }

  /**
   * Ultra-small monospace telemetry annotation.
   * The `size: 7` default keeps it visually subordinate to the node labels.
   */
  function drawTelem(x, y, text, { align = 'center', color = '#bbb', size = 7 } = {}) {
    const ctx = canvasCtx;
    ctx.save();
    ctx.font         = `${size}px "Courier New", monospace`;
    ctx.fillStyle    = color;
    ctx.textAlign    = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }


  // ─────────────────────────────────────────────
  // PUBLIC — renderTree
  // ─────────────────────────────────────────────

  /**
   * Draws the full decision tree for the AI's most recent move.
   *
   * Tree structure:
   *   ROOT            — current board state (top centre)
   *   │
   *   ├─[+067]  …     — 7 branch nodes, one per column (A–G)
   *   │   └─ telemetry (EVAL_COMPLETE / SYS_PRUNED / TERMINAL)
   *   │
   *   │ (from chosen branch, straight down:)
   *   ├─[PLY  ]       — predicted player response
   *   ├─[A.I. ]       — predicted AI counter
   *   └─[PLY  ]       — predicted player counter
   *
   *   (from 2 decent non-chosen branches, diagonal sub-trees:)
   *   └─[+045] / [−080]   decorative depth-1 nodes showing worsening lines
   *
   * @param {{
   *   columnScores:       Array<{col:number, valid:boolean, score:number|null}>,
   *   principalVariation: number[],
   *   chosenCol:          number
   * }} data
   */
  function renderTree({ columnScores, principalVariation, chosenCol }) {
    if (!canvasEl || !canvasCtx) return;

    // Sync drawing buffer to current CSS rendered width; clear to transparent.
    const W = Math.max(canvasEl.clientWidth, 400);
    canvasEl.width  = W;
    canvasEl.height = CANVAS_H;
    canvasCtx.clearRect(0, 0, W, CANVAS_H);

    // ── Layout constants ────────────────────────────────────────────────────
    const cellW   = W / 7;
    const rootX   = W / 2;
    const rootY   = 38;     // root node vertical centre
    const branchY = 132;    // branch-node vertical centre
    const pvStep  = 85;     // gap between successive PV nodes

    // Horizontal centre for each of the 7 columns (0–6)
    const colX = Array.from({ length: 7 }, (_, i) => cellW * i + cellW / 2);

    // Score extremes for branch classification
    const validScores = columnScores
      .filter(c => c.valid && c.score !== null)
      .map(c => c.score);
    const maxScore = validScores.length ? Math.max(...validScores) : 0;

    // ── Header telemetry ────────────────────────────────────────────────────
    drawTelem(8,     14, 'DECISION_TREE_RENDER / ALPHA_BETA_PRUNED', { align: 'left',  color: '#ccc', size: 9 });
    drawTelem(W - 8, 14, `BRANCHES_EVAL: ${validScores.length} / 7`,  { align: 'right', color: '#ccc', size: 9 });

    // ── Root node ───────────────────────────────────────────────────────────
    const rootBox = drawNode(rootX, rootY, null, { bold: true, color: '#1a1a1a', size: 13 });
    drawTelem(rootX, rootBox.top - 7, 'CURRENT BOARD STATE', { color: '#aaa', size: 9 });

    // ── Branch lines and column nodes ───────────────────────────────────────
    // boxes[col] stores the bounding box for each rendered branch node.
    // Used later for the PV tail and decorative sub-branches.
    const boxes = new Array(7).fill(null);

    columnScores.forEach(({ col, valid, score }) => {
      const x        = colX[col];
      const isChosen = col === chosenCol;
      const isWin    = valid && score !== null && score >=  999_000;
      const isLoss   = valid && score !== null && score <= -999_000;
      // "bad" = column is full, or its score is >500 below the best found
      const isBad    = !valid || (valid && score !== null && score < maxScore - 500);

      // ── Connecting line: root → branch node ──────────────────────────────
      drawLine(rootX, rootBox.bottom, x, branchY - 11, {
        color: isChosen ? '#1a1a1a' : (!valid ? '#eee' : isBad ? '#ddd' : '#999'),
        width: isChosen ? 2.5 : 0.75,
        dash:  isLoss ? [4, 3] : (isBad && valid ? [2, 3] : []),
      });

      // ── Column letter label above the node ───────────────────────────────
      drawTelem(x, branchY - 16, `COL_${String.fromCharCode(65 + col)}`, {
        color: isChosen ? '#555' : (!valid ? '#e8e8e8' : '#bbb'),
        size:  9,
      });

      // ── Full-column: just a faint × ───────────────────────────────────────
      if (!valid) {
        drawCross(x, branchY, 5, { color: '#dfdfdf', weight: 1 });
        drawTelem(x, branchY + 16, 'COL_FULL', { color: '#e8e8e8', size: 8 });
        return;
      }

      // ── Bracket node label ────────────────────────────────────────────────
      const nodeColor = isChosen ? '#1a1a1a'
                      : isLoss   ? '#cc1c1c'
                      : isBad    ? '#ccc'
                      :            '#666';

      const box = drawNode(x, branchY, score, {
        bold:  isChosen,
        color: nodeColor,
        size:  isChosen ? 12 : 11,
      });
      boxes[col] = box;

      // ── × overlay for bad / losing branches ──────────────────────────────
      // Drawn over the label text to stamp it as rejected.
      if (isLoss) {
        drawCross(x, branchY, 10, { color: '#cc1c1c', weight: 1.5 });
      } else if (isBad) {
        drawCross(x, branchY, 9,  { color: '#ddd',    weight: 1.2 });
      }

      // ── Telemetry: evaluation status below the node ───────────────────────
      const telemStr = isWin    ? 'TERMINAL / WIN_DETECTED'
                     : isLoss   ? 'TERMINAL / LOSS_PROJECTED'
                     : isChosen ? 'EVAL_COMPLETE / SELECTED'
                     : isBad    ? 'SYS_PRUNED / BELOW_THRESH'
                     :            'EVAL_COMPLETE';
      drawTelem(x, box.bottom + 10, telemStr, {
        color: isChosen ? '#888' : '#d4d4d4',
        size:  isChosen ? 9 : 8,
      });
    });

    // ── PV "foresight" tail ─────────────────────────────────────────────────
    //
    // The Principal Variation is drawn as a vertical chain of nodes directly
    // below the chosen branch, representing the AI's predicted future:
    //
    //   [chosen]
    //      │  PLY_RESPONSE → COL_C
    //   [PLY  ]
    //      │  AI_COUNTER   → COL_D
    //   [A.I. ]
    //      │  PLY_RESPONSE → COL_C
    //   [PLY  ]

    const chosenBox = boxes[chosenCol];
    if (chosenBox && principalVariation && principalVariation.length > 0) {
      const pvX   = colX[chosenCol]; // PV descends on the chosen column's axis
      let   prevY = chosenBox.bottom;

      // Annotation appears to the right of the line unless the chosen column
      // is in the right 40% of the canvas, in which case it goes left.
      const annoToRight  = pvX < W * 0.60;
      const annoX        = annoToRight ? pvX + 10 : pvX - 10;
      const annoAlign    = annoToRight ? 'left' : 'right';
      const pvWhoLabels  = ['PLY_RESPONSE', 'AI_COUNTER', 'PLY_RESPONSE'];

      principalVariation.slice(0, 3).forEach((pvCol, i) => {
        if (pvCol === undefined || pvCol < 0 || pvCol > 6) return;

        const pvCy  = prevY + pvStep;
        const isAI  = (i % 2 === 1); // 0=player, 1=AI, 2=player

        // Vertical connecting line
        drawLine(pvX, prevY, pvX, pvCy - 11, {
          color: isAI ? '#1a1a1a' : '#888',
          width: isAI ? 2 : 1,
          dash:  isAI ? [] : [3, 2],
        });

        // Side annotation (who plays next, which column)
        const midY = prevY + pvStep * 0.45;
        drawTelem(annoX, midY,      pvWhoLabels[i],                              { align: annoAlign, color: '#bbb', size: 9 });
        drawTelem(annoX, midY + 11, `→ COL_${String.fromCharCode(65 + pvCol)}`,  { align: annoAlign, color: '#aaa', size: 9 });

        // PV bracket node: [ A.I. ] or [ PLY  ]
        const pvLabel = isAI ? '[ A.I. ]' : '[ PLY  ]';
        const pvBox   = drawNode(pvX, pvCy, null, {
          label: pvLabel,
          bold:  isAI,
          color: isAI ? '#1a1a1a' : '#888',
          size:  11,
        });

        drawTelem(pvX, pvBox.bottom + 9,
          isAI ? 'AI_MOVE_PREDICTED' : 'OPP_RESPONSE_EST',
          { color: '#ccc', size: 8 });

        prevY = pvBox.bottom;
      });
    }

    // ── Decorative sub-branches ─────────────────────────────────────────────
    //
    // For up to 2 decent non-chosen branches, draw two child nodes at depth+1
    // to show the search went deeper and those lines were found inferior.
    // Child scores are deterministically derived from the real scores so the
    // pattern is stable — the same position always produces the same diagram.

    const altCols = columnScores
      .filter(c => c.valid && c.col !== chosenCol && c.score !== null
                && c.score >= maxScore - 500)
      .slice(0, 2);

    altCols.forEach(({ col, score }) => {
      const parent = boxes[col];
      if (!parent) return;

      // sin() maps any integer to a stable [0,1] value — no Math.random().
      const t1 = Math.abs(Math.sin(score * 0.137 + col * 1.3));
      const t2 = Math.abs(Math.sin(score * 0.537 + col * 2.1));

      // Left child: slightly worse; right child: notably worse (often negative)
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

        drawLine(colX[col], parent.bottom, cx, cy - 10, {
          color: '#e2e2e2',
          width: 0.75,
          dash:  isBadChild ? [2, 3] : [],
        });

        drawNode(cx, cy, childScore, {
          color: isBadChild ? '#d4d4d4' : '#bbb',
          size:  10,
        });

        if (isBadChild) drawCross(cx, cy, 8, { color: '#ebebeb', weight: 1 });

        drawTelem(cx, cy + 14,
          isBadChild ? 'SYS_PRUNED' : 'EVAL_DEPTH+1',
          { color: '#ddd', size: 8 });
      });
    });

    // ── Legend ──────────────────────────────────────────────────────────────
    drawTelem(W - 8, CANVAS_H - 18,
      '━━ OPTIMAL   ╌╌ ALT   ╳ PRUNED   [ X ] SCORE_NODE',
      { align: 'right', color: '#ccc', size: 9 });
    drawTelem(8, CANVAS_H - 18,
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
    canvasCtx.clearRect(0, 0, W, CANVAS_H); // transparent
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
