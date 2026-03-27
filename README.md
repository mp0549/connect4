# EXPERIMENT 03 // ALGORITHMIC COGNITION (Connect 4)

> **STATUS:** OPERATIONAL
> **CLASSIFICATION:** UNCLASSIFIED // FOR PORTFOLIO USE ONLY
> A data-dense Connect 4 interface featuring a full Minimax AI and live decision-tree visualization.
> [→ INITIATE EXPERIMENT (Live Demo)](https://mp0549.github.io/connect4)

---

## PROJECT OVERVIEW

It's Connect 4. You drop pieces. The AI thinks. You lose.

Unlike a standard Connect 4 game, this interface exposes the AI's internal cognition in real-time. The right-hand panel streams raw telemetry—nodes evaluated, branches pruned, and best projected scores. Below the board, a live HTML5 Canvas draws the AI's decision tree, mapping out every move it considered and why it rejected the alternatives.

The aesthetic is strictly clinical: monospace typography, harsh geometric borders, faint schematics, and stark red crosses stamped over losing branches like a redacted government document.

---

## SYSTEM ARCHITECTURE

### The Engine: Minimax + Alpha-Beta Pruning

The "brain" is powered by the **Minimax algorithm**. It hallucinates a game tree, exploring all possible move sequences up to a configurable depth, and scores the resulting board states. It operates on the assumption that you will play optimally, selecting the move that minimizes your best possible outcome.

This is optimized with **Alpha-Beta Pruning**, which mathematically severs entire subtrees the moment it proves they cannot yield a better outcome than a previously evaluated path. This effectively halves the required compute budget—allowing a depth-7 search to execute in milliseconds and play well above a human amateur level.

**Move ordering** (evaluating center columns first) makes this pruning exponentially more aggressive. By identifying strong moves early, the algorithm sets tight parameters that allow it to reject weak branches almost instantly.

The heuristic scores a board by sliding a 4-cell window across all 69 possible horizontal, vertical, and diagonal lines, applying the following weights:
* **3-in-a-row (1 empty):** +50 pts
* **2-in-a-row (2 empty):** +10 pts
* **Opponent's 3-in-a-row:** -80 pts *(Blocking is weighted heavier than attacking)*
* **Center Column Occupancy:** +4 pts per piece *(Strategic dominance)*

### The Foresight Tail (Principal Variation)

Upon selecting the optimal move, the AI executes a shallow follow-up sequence—the **Principal Variation (PV)**. It traces its predicted optimal reply sequence 3 plies deep. This manifests on the canvas as a vertical "foresight tail," revealing exactly what the AI expects you to do and the trap it has prepared in response.

### Visualizer: The Canvas Decision Tree

Following every AI turn, the lower telemetry panel renders the exact mathematical logic behind the move:

* **Root State:** The mini-board representing the current game state.
* **Branch Matrix:** 7 mini-boards representing the immediate hypothetical outcomes for each column. The selected optimal path is highlighted with a thick stroke; mathematically inferior branches are stamped with a red `[ X ]`.
* **Foresight Tail:** A vertical descent of 3 mini-boards extending from the chosen column, detailing the exact `Player Response -> AI Counter -> Player Counter` sequence.
* **Sub-Branching:** Depth+1 text nodes branching off competitive (but ultimately rejected) columns, proving the AI searched deeper before discarding them.
* **Telemetry Tags:** Monospace readouts logging the exact status of each node (e.g., `EVAL_COMPLETE`, `SYS_PRUNED`, `WIN_DETECTED`).

*Note: Each mini-board is a pixel-perfect 28x24px geometric render (7 columns x 6 rows at 4px/cell). Player assets are stark black; AI assets are synthetic red.*

---

## PARAMETERS: DIFFICULTY

| LEVEL | DEPTH | BEHAVIOR PROFILE |
| :--- | :--- | :--- |
| **EASY** | 2 | Beatable with basic strategy. |
| **MED** | 4 | Highly competitive; will punish mistakes. |
| **HARD** | 6 | Near-optimal play; rarely misses a forced win. *(Default)* |
| **ADV** | 1–10 | Manual override slider. *(Warning: Depths 8+ may cause browser throttling on older hardware).* |

---

## DIRECTORY STRUCTURE

```text
connect4/
├── index.html
├── css/
│   └── style.css          — Unified styling; brutalist lab aesthetic
└── js/
    ├── gameState.js       — Pure game logic (board state, win detection, piece dropping)
    ├── aiHeuristic.js     — Board evaluation math (scoreWindow, evaluateBoard)
    ├── ai.js              — Minimax + Alpha-Beta + PV trace (AI_ENGINE)
    ├── canvasDraw.js      — Canvas drawing primitives & drawMiniBoard (CANVAS_DRAW)
    ├── canvas.js          — Decision tree layout and geometric rendering (TREE_CANVAS)
    ├── visualizer.js      — Right-panel telemetry logs and stat readouts (VISUALIZER)
    ├── ui.js              — DOM board rendering and event listeners (UI)
    └── main.js            — Primary orchestrator; owns game state and loop
