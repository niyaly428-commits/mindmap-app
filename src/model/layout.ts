import type { DesignPreset, MindMapDoc, NodeId, Side } from './types';
import { descendantIds } from './tree';

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
  const childrenOnSide = (id: NodeId, inheritedSide: Side, side: Side) =>
    visibleChildren(id).filter((child) => (doc.nodes[child].side ?? inheritedSide) === side);
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

  const stackHeight = (ids: NodeId[], depth: number, side: Side) =>
    ids.reduce((sum, c) => sum + subtreeHeight(c, depth, side), 0) + Math.max(0, ids.length - 1) * gapFor(depth);

  function subtreeHeight(id: NodeId, depth: number, inheritedSide: Side): number {
    const cached = subtree.get(id);
    if (cached !== undefined) return cached;
    const nodeSide = doc.nodes[id].side ?? inheritedSide;
    const leftHeight = stackHeight(childrenOnSide(id, nodeSide, 'left'), depth + 1, 'left');
    const rightHeight = stackHeight(childrenOnSide(id, nodeSide, 'right'), depth + 1, 'right');
    const h = Math.max(sizeOf(id, depth).height, leftHeight, rightHeight);
    subtree.set(id, h);
    return h;
  }

  function place(id: NodeId, anchorX: number, top: number, side: Side, depth: number, branch: number) {
    const { width, height } = sizeOf(id, depth);
    const centerY = top + subtreeHeight(id, depth, side) / 2;
    const baseGap = preset === 'soft-organic' ? (depth === 1 ? 84 : 48) : preset === 'clean-structured' ? (depth === 1 ? 62 : 48) : (depth === 1 ? 66 : 52);
    // Reserve a vertical routing bus between each parent and its children.
    const routeGap = preset === 'soft-organic' ? 0 : 32;
    const gap = Math.max(baseGap, routeGap);
    const x = side === 'right' ? anchorX + gap : anchorX - gap - width;
    boxes.set(id, { id, x, y: centerY - height / 2, width, height, depth, side, branch });
    placeStack(childrenOnSide(id, side, 'right'), x + width, centerY, 'right', depth + 1, branch);
    placeStack(childrenOnSide(id, side, 'left'), x, centerY, 'left', depth + 1, branch);
  }

  function placeStack(ids: NodeId[], anchorX: number, centerY: number, side: Side, depth: number, branch: number) {
    let top = centerY - stackHeight(ids, depth, side) / 2;
    for (const c of ids) {
      place(c, anchorX, top, side, depth, branch < 0 ? root.children.indexOf(c) : branch);
      top += subtreeHeight(c, depth, side) + gapFor(depth);
    }
  }

  const root = doc.nodes[doc.rootId];
  const naturalPositions = new Map<NodeId, { x: number; y: number }>();
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
  for (const [id, box] of boxes) naturalPositions.set(id, { x: box.x, y: box.y });
  const manualNodes = Object.values(doc.nodes)
    .filter((node) => node.position && boxes.has(node.id))
    .sort((a, b) => boxes.get(a.id)!.depth - boxes.get(b.id)!.depth);
  const translateUnplacedDescendants = (id: NodeId, dx: number, dy: number) => {
    for (const childId of visibleChildren(id)) {
      if (doc.nodes[childId].position) continue;
      const child = boxes.get(childId);
      if (child) boxes.set(childId, { ...child, x: child.x + dx, y: child.y + dy });
      translateUnplacedDescendants(childId, dx, dy);
    }
  };
  // A moved node is an anchor. Shift any auto-laid descendants with it, while
  // keeping separately placed descendants anchored at their own saved positions.
  for (const node of manualNodes) {
    if (node.position && boxes.has(node.id)) {
      const box = boxes.get(node.id)!;
      const natural = naturalPositions.get(node.id)!;
      const dx = node.position.x - natural.x;
      const dy = node.position.y - natural.y;
      boxes.set(node.id, { ...box, x: node.position.x, y: node.position.y });
      if (dx !== 0 || dy !== 0) translateUnplacedDescendants(node.id, dx, dy);
    }
  }

  // A free drag can place a node over a different branch. Keep that placement
  // as the anchor, then move the smallest non-root subtree out of the way.
  // Repeating this after every layout pass makes the result deterministic while
  // keeping parent/child subtrees together and avoiding box intersections.
  const intersects = (a: NodeBox, b: NodeBox) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const isAncestor = (ancestor: NodeId, child: NodeId) => {
    let parent = doc.nodes[child].parentId;
    while (parent) {
      if (parent === ancestor) return true;
      parent = doc.nodes[parent]?.parentId ?? null;
    }
    return false;
  };
  const ids = [...boxes.keys()];
  const subtreeMembers = new Map(ids.map((id) => [id, [id, ...descendantIds(doc.nodes, id)]]));
  const shiftSubtree = (id: NodeId, deltaY: number) => {
    for (const currentId of subtreeMembers.get(id) ?? [id]) {
      const box = boxes.get(currentId);
      if (box) boxes.set(currentId, { ...box, y: box.y + deltaY });
    }
  };
  for (let pass = 0; pass < ids.length * 2; pass++) {
    let moved = false;
    for (let i = 0; i < ids.length && !moved; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const aId = ids[i];
        const bId = ids[j];
        const a = boxes.get(aId)!;
        const b = boxes.get(bId)!;
        if (!intersects(a, b)) continue;

        // If an ancestor was moved, preserve the child as the more precise anchor.
        let targetId: NodeId;
        let fixed: NodeBox;
        if (isAncestor(aId, bId)) { targetId = bId; fixed = a; }
        else if (isAncestor(bId, aId)) { targetId = aId; fixed = b; }
        else if (aId === doc.rootId) { targetId = bId; fixed = a; }
        else if (bId === doc.rootId) { targetId = aId; fixed = b; }
        else if (!!doc.nodes[aId].position !== !!doc.nodes[bId].position) {
          targetId = doc.nodes[aId].position ? bId : aId;
          fixed = targetId === aId ? b : a;
        } else {
          // Stable tree order breaks ties when two explicitly placed nodes meet.
          targetId = bId;
          fixed = a;
        }
        const target = boxes.get(targetId)!;
        const gap = preset === 'soft-organic' ? 14 : 18;
        shiftSubtree(targetId, fixed.y + fixed.height + gap - target.y);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return boxes;
}
