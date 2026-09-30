import type { DesignPreset, MindMapDoc, NodeId, Side } from './types';

export interface NodeBox {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: Side | null;
  /** Index of the main topic (root child) this node belongs to; -1 for root. */
  branch: number;
}

export type TextMeasurer = (text: string, font: string) => number;

export interface Size {
  width: number;
  height: number;
}

/** Width of one small icon (status / memo / link) including its gap. */
export const ICON_WIDTH = 20;

interface LevelStyle {
  font: string;
  lineHeight: number;
  padX: number;
  padY: number;
  maxTextWidth: number;
  minWidth: number;
  /** Extra width taken by the checkbox. */
  extra: number;
}

export const FONT_FAMILY = `system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif`;

export const levelStyle = (depth: number): LevelStyle =>
  depth === 0
    ? { font: `700 20px ${FONT_FAMILY}`, lineHeight: 28, padX: 24, padY: 14, maxTextWidth: 280, minWidth: 120, extra: 0 }
    : depth === 1
      ? { font: `700 15px ${FONT_FAMILY}`, lineHeight: 22, padX: 14, padY: 9, maxTextWidth: 240, minWidth: 80, extra: 22 }
      : { font: `400 13px ${FONT_FAMILY}`, lineHeight: 19, padX: 10, padY: 5, maxTextWidth: 240, minWidth: 60, extra: 20 };

let canvasCtx: CanvasRenderingContext2D | null | undefined;

/** Uses a canvas to measure text in the browser; falls back to a char-count estimate elsewhere. */
export const defaultMeasurer: TextMeasurer = (text, font) => {
  if (canvasCtx === undefined) {
    canvasCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (canvasCtx) {
    canvasCtx.font = font;
    return canvasCtx.measureText(text).width;
  }
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 14);
  return [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? size : size * 0.6), 0);
};

/** Max rendered width of a topic box at this depth (text wraps beyond it). Used by the CSS too. */
export const maxNodeWidth = (depth: number, icons = 0): number => {
  const s = levelStyle(depth);
  return s.maxTextWidth + s.padX * 2 + s.extra + icons * ICON_WIDTH + 2;
};

/** Estimated size, used until the rendered node has been measured. */
export function measureNode(text: string, depth: number, measure: TextMeasurer, icons = 0): Size {
  const s = levelStyle(depth);
  const lines = (text || ' ').split('\n');
  let textWidth = 0;
  let lineCount = 0;
  for (const line of lines) {
    const w = measure(line || ' ', s.font);
    textWidth = Math.max(textWidth, Math.min(w, s.maxTextWidth));
    lineCount += Math.max(1, Math.ceil(w / s.maxTextWidth));
  }
  return {
    width: Math.ceil(Math.max(s.minWidth, textWidth + s.padX * 2 + s.extra + icons * ICON_WIDTH)) + 2,
    height: Math.ceil(lineCount * s.lineHeight + s.padY * 2) + 2,
  };
}

/** Extra inline items after the text, in icon widths (memo, link; the due date badge is ~3 icons wide). */
export const iconCount = (node: MindMapDoc['nodes'][string]): number =>
  (node.note ? 1 : 0) + (node.link ? 1 : 0) + (node.dueDate ? 3 : 0);

/**
 * Two-sided mind map layout. Every subtree gets its own vertical band sized from the real
 * (measured) node sizes, so topics never overlap regardless of text length.
 * `measured` holds rendered DOM sizes; nodes not measured yet use an estimate.
 */
export function layoutMap(
  doc: MindMapDoc,
  measure: TextMeasurer = defaultMeasurer,
  measured?: ReadonlyMap<NodeId, Size>,
  preset: DesignPreset = 'soft-organic',
): Map<NodeId, NodeBox> {
  const boxes = new Map<NodeId, NodeBox>();
  const sizes = new Map<NodeId, Size>();
  const subtree = new Map<NodeId, number>();

  const visibleChildren = (id: NodeId) => (doc.nodes[id].collapsed ? [] : doc.nodes[id].children);
  // Keep sibling connector lanes separate, including the vertical bands occupied by
  // each sibling's descendants. Structured presets need room for clear orthogonal turns.
  const gapFor = (depth: number) => preset === 'soft-organic' ? (depth === 1 ? 34 : 14) : preset === 'clean-structured' ? (depth === 1 ? 28 : 18) : (depth === 1 ? 30 : 16);

  const sizeOf = (id: NodeId, depth: number) => {
    let s = sizes.get(id);
    if (!s) {
      const node = doc.nodes[id];
      s = measured?.get(id) ?? measureNode(node.text, depth, measure, iconCount(node));
      sizes.set(id, s);
    }
    return s;
  };

  const stackHeight = (ids: NodeId[], depth: number) =>
    ids.reduce((sum, c) => sum + subtreeHeight(c, depth), 0) + Math.max(0, ids.length - 1) * gapFor(depth);

  function subtreeHeight(id: NodeId, depth: number): number {
    const cached = subtree.get(id);
    if (cached !== undefined) return cached;
    const h = Math.max(sizeOf(id, depth).height, stackHeight(visibleChildren(id), depth + 1));
    subtree.set(id, h);
    return h;
  }

  function place(id: NodeId, anchorX: number, top: number, side: Side, depth: number, branch: number) {
    const { width, height } = sizeOf(id, depth);
    const centerY = top + subtreeHeight(id, depth) / 2;
    const baseGap = preset === 'soft-organic' ? (depth === 1 ? 84 : 48) : preset === 'clean-structured' ? (depth === 1 ? 62 : 48) : (depth === 1 ? 66 : 52);
    // Reserve a vertical routing bus between each parent and its children.
    const routeGap = preset === 'soft-organic' ? 0 : 32;
    const gap = Math.max(baseGap, routeGap);
    const x = side === 'right' ? anchorX + gap : anchorX - gap - width;
    boxes.set(id, { id, x, y: centerY - height / 2, width, height, depth, side, branch });
    placeStack(visibleChildren(id), side === 'right' ? x + width : x, centerY, side, depth + 1, branch);
  }

  function placeStack(ids: NodeId[], anchorX: number, centerY: number, side: Side, depth: number, branch: number) {
    let top = centerY - stackHeight(ids, depth) / 2;
    for (const c of ids) {
      place(c, anchorX, top, side, depth, branch < 0 ? root.children.indexOf(c) : branch);
      top += subtreeHeight(c, depth) + gapFor(depth);
    }
  }

  const root = doc.nodes[doc.rootId];
  const rootSize = sizeOf(root.id, 0);
  boxes.set(root.id, {
    id: root.id,
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    ...rootSize,
    depth: 0,
    side: null,
    branch: -1,
  });
  if (!root.collapsed) {
    const right = root.children.filter((c) => doc.nodes[c].side !== 'left');
    const left = root.children.filter((c) => doc.nodes[c].side === 'left');
    placeStack(right, rootSize.width / 2, 0, 'right', 1, -1);
    placeStack(left, -rootSize.width / 2, 0, 'left', 1, -1);
  }
  // Preserve positions produced by a completed React Flow drag. Descendants are
  // stored too, so moving a branch keeps its internal geometry intact.
  for (const node of Object.values(doc.nodes)) {
    if (node.position && boxes.has(node.id)) {
      const box = boxes.get(node.id)!;
      boxes.set(node.id, { ...box, x: node.position.x, y: node.position.y });
    }
  }
  return boxes;
}
