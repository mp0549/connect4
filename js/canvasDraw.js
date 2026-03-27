/**
 * canvasDraw.js — Canvas Drawing Primitives
 * ──────────────────────────────────────────
 * Low-level, stateless 2D canvas helpers for the A.I. decision tree renderer.
 * Every function takes `ctx` as its first argument so it is decoupled from
 * any specific canvas element — canvas.js passes its own ctx.
 *
 * Globals consumed: GameState (PLAYER, AI constants — used in drawMiniBoard)
 * Globals exposed:  CANVAS_DRAW
 *
 * Public API:
 *   CANVAS_DRAW.fmtBracket(score)                        → string
 *   CANVAS_DRAW.drawLine(ctx, x1,y1,x2,y2, opts)         → void
 *   CANVAS_DRAW.drawCross(ctx, x,y, size, opts)           → void
 *   CANVAS_DRAW.drawNode(ctx, cx,cy, score, opts)         → BoundingBox
 *   CANVAS_DRAW.drawTelem(ctx, x,y, text, opts)           → void
 *   CANVAS_DRAW.drawMiniBoard(ctx, cx,cy, boardState)     → BoundingBox
 *
 * BoundingBox: { top, bottom, left, right, cx, cy }
 *
 * Split from canvas.js so neither file exceeds a comfortable reading length.
 */

const CANVAS_DRAW = (() => {

  // ─────────────────────────────────────────────
  // SCORE FORMATTING
  // ─────────────────────────────────────────────

  /**
   * Converts a numeric score into a fixed-width bracket label.
   * All valid labels are designed to be the same visual width in
   * Courier New so columns stay optically aligned.
   *
   *   null      → '[ ROOT ]'
   *   ≥ 999_000 → '[ WIN  ]'
   *   ≤−999_000 → '[ LOSS ]'
   *   67        → '[+067]'
   *  −40        → '[-040]'
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
  // PRIMITIVE DRAWING FUNCTIONS
  // ─────────────────────────────────────────────

  /**
   * Draws a straight line from (x1,y1) to (x2,y2).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number}   x1
   * @param {number}   y1
   * @param {number}   x2
   * @param {number}   y2
   * @param {object}   opts
   * @param {string}   [opts.color='#aaa']
   * @param {number}   [opts.width=1]
   * @param {number[]} [opts.dash=[]]  Linedash pattern; [] = solid
   */
  function drawLine(ctx, x1, y1, x2, y2, { color = '#aaa', width = 1, dash = [] } = {}) {
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
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} size    Half the diagonal length of the ×
   * @param {object} opts
   * @param {string}  [opts.color='#cc1c1c']
   * @param {number}  [opts.weight=1.5]
   */
  function drawCross(ctx, x, y, size, { color = '#cc1c1c', weight = 1.5 } = {}) {
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
   * Draws a bracket-label text node and returns its bounding box.
   * Used for score annotations, decorative sub-branches, and PV labels.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number}      cx       Horizontal centre
   * @param {number}      cy       Vertical centre (baseline-middle)
   * @param {number|null} score    Score to format via fmtBracket, or null for ROOT
   * @param {object}      opts
   * @param {boolean}     [opts.bold=false]
   * @param {string}      [opts.color='#1a1a1a']
   * @param {number}      [opts.size=9]          Font size in px
   * @param {string|null} [opts.label=null]      Override text (skips fmtBracket)
   * @returns {{ top, bottom, left, right, cx, cy }}
   */
  function drawNode(ctx, cx, cy, score, { bold = false, color = '#1a1a1a', size = 9, label = null } = {}) {
    const text = label !== null ? label : fmtBracket(score);
    ctx.save();
    ctx.font         = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`;
    ctx.fillStyle    = color;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    const tw = ctx.measureText(text).width;
    ctx.restore();
    const hh = size * 0.65; // half-height estimate for Courier New cap-height
    return { top: cy - hh, bottom: cy + hh, left: cx - tw / 2, right: cx + tw / 2, cx, cy };
  }

  /**
   * Ultra-small monospace telemetry annotation.
   * Renders visually subordinate to node labels.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y     Alphabetic baseline
   * @param {string} text
   * @param {object} opts
   * @param {string}  [opts.align='center']
   * @param {string}  [opts.color='#bbb']
   * @param {number}  [opts.size=7]
   */
  function drawTelem(ctx, x, y, text, { align = 'center', color = '#bbb', size = 7 } = {}) {
    ctx.save();
    ctx.font         = `${size}px "Courier New", monospace`;
    ctx.fillStyle    = color;
    ctx.textAlign    = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Draws a tiny 6-row × 7-col mini-board for a game state.
   * Each cell is CELL×CELL pixels; total footprint: 28 × 24 px.
   *
   * Visual convention:
   *   Player pieces → solid black (#1a1a1a)
   *   AI pieces     → solid red   (#cc1c1c)
   *   Empty cells   → transparent with faint inner grid
   *   Outer border  → 1px solid black — the "classified document" frame
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number}       cx          Horizontal centre of the mini board
   * @param {number}       cy          Vertical centre of the mini board
   * @param {number[][]|null} boardState  6×7 game state array; null draws empty grid
   * @returns {{ top, bottom, left, right, cx, cy }}  Pixel-accurate bounding box
   */
  function drawMiniBoard(ctx, cx, cy, boardState) {
    const CELL = 4;
    const COLS = 7;
    const ROWS = 6;
    const W    = COLS * CELL;  // 28 px
    const H    = ROWS * CELL;  // 24 px

    const x0 = Math.round(cx - W / 2);
    const y0 = Math.round(cy - H / 2);

    ctx.save();

    // ── Background ────────────────────────────────────────────────────────
    // Faint fill so empty cells are visible against the transparent canvas.
    ctx.fillStyle = 'rgba(245, 245, 245, 0.60)';
    ctx.fillRect(x0, y0, W, H);

    // ── Piece fills ───────────────────────────────────────────────────────
    if (boardState) {
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const val = boardState[row][col];
          if (val === GameState.PLAYER) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x0 + col * CELL, y0 + row * CELL, CELL, CELL);
          } else if (val === GameState.AI) {
            ctx.fillStyle = '#cc1c1c';
            ctx.fillRect(x0 + col * CELL, y0 + row * CELL, CELL, CELL);
          }
        }
      }
    }

    // ── Inner grid ────────────────────────────────────────────────────────
    // Very faint lines at cell boundaries give a grid appearance without
    // competing with the piece fills.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([]);

    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(x0,     y0 + r * CELL);
      ctx.lineTo(x0 + W, y0 + r * CELL);
      ctx.stroke();
    }
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(x0 + c * CELL, y0);
      ctx.lineTo(x0 + c * CELL, y0 + H);
      ctx.stroke();
    }

    // ── Outer border ──────────────────────────────────────────────────────
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(x0, y0, W, H);

    ctx.restore();

    return {
      top:    y0,
      bottom: y0 + H,
      left:   x0,
      right:  x0 + W,
      cx,
      cy,
    };
  }


  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  return { fmtBracket, drawLine, drawCross, drawNode, drawTelem, drawMiniBoard };

})();
