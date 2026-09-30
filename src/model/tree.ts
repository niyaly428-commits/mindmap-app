import type { DisplayStatus, MindMapDoc, MindNode, NodeId, Side } from './types';

export const DEFAULT_MAP_TITLE = '無題のマインドマップ';
export const DEFAULT_TOPIC_TEXT = '新しいトピック';

export const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** The map title and the root topic text are always the same. */
export function createMap(title = DEFAULT_MAP_TITLE, now = Date.now()): MindMapDoc {
  const rootId = createId();
  return {
    id: createId(),
    schemaVersion: 1,
    title,
    rootId,
    nodes: { [rootId]: { id: rootId, text: title, parentId: null, children: [], checked: false } },
    createdAt: now,
    updatedAt: now,
  };
}

type Nodes = Record<NodeId, MindNode>;

const withNodes = (doc: MindMapDoc, nodes: Nodes): MindMapDoc => ({ ...doc, nodes });

export function descendantIds(nodes: Nodes, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack = [...(nodes[id]?.children ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...nodes[cur].children);
  }
  return out;
}

export function isDescendant(nodes: Nodes, ancestorId: NodeId, id: NodeId): boolean {
  let cur = nodes[id]?.parentId ?? null;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = nodes[cur].parentId;
  }
  return false;
}

/** Returns the root-child ancestor (main topic) of a node, or null for the root itself. */
export function branchOf(doc: MindMapDoc, id: NodeId): NodeId | null {
  let cur: NodeId | null = id;
  while (cur && doc.nodes[cur].parentId !== doc.rootId) {
    cur = doc.nodes[cur].parentId;
  }
  return cur;
}

export function sideOf(doc: MindMapDoc, id: NodeId): Side | null {
  if (id === doc.rootId) return null;
  const node = doc.nodes[id];
  if (!node) return null;
  if (node.side) return node.side;
  return node.parentId ? (sideOf(doc, node.parentId) ?? 'right') : null;
}

/** Completing a task clears its in-progress status, so un-completing it returns to "未着手". */
function withChecked(node: MindNode, checked: boolean): MindNode {
  const next = { ...node, checked };
  if (checked) delete next.status;
  return next;
}

/** Parent is checked iff it has children and all of them are checked. Walks up from `startId`. */
function syncAncestors(nodes: Nodes, startId: NodeId | null): void {
  let cur = startId;
  while (cur) {
    const node = nodes[cur];
    if (node.children.length > 0) {
      const all = node.children.every((c) => nodes[c].checked);
      if (all !== node.checked) nodes[cur] = withChecked(node, all);
    }
    cur = node.parentId;
  }
}

function pickSide(nodes: Nodes, root: MindNode): Side {
  const estimateNodeHeight = (id: NodeId, depth: number) => {
    const node = nodes[id];
    const maxTextWidth = 240 - (node.note ? 20 : 0) - (node.link ? 20 : 0) - (node.dueDate ? 60 : 0);
    const textWidth = (line: string) => [...line].reduce((width, char) => width + (char.charCodeAt(0) > 0xff ? 14 : 7.5), 0);
    const lines = (node.text || ' ').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(textWidth(line || ' ') / Math.max(80, maxTextWidth))), 0);
    return lines * (depth === 1 ? 22 : 19) + (depth === 1 ? 18 : 10);
  };
  type BranchStats = { height: number; count: number; placedTop: number; placedBottom: number };
  const branchStats = (id: NodeId, depth: number, inheritedSide: Side): BranchStats => {
    const node = nodes[id];
    const height = estimateNodeHeight(id, depth);
    const placedTop = node.position?.y ?? Number.POSITIVE_INFINITY;
    const placedBottom = node.position ? node.position.y + height : Number.NEGATIVE_INFINITY;
    const children = node.collapsed ? [] : node.children;
    const stacks: Record<Side, BranchStats[]> = { left: [], right: [] };
    for (const child of children) {
      const side = nodes[child].side ?? inheritedSide;
      stacks[side].push(branchStats(child, depth + 1, side));
    }
    const stackHeight = (side: Side) => stacks[side].reduce((sum, child) => sum + child.height, 0) + Math.max(0, stacks[side].length - 1) * 24;
    const childStats = [...stacks.left, ...stacks.right];
    return {
      height: Math.max(height, stackHeight('left'), stackHeight('right')),
      count: 1 + childStats.reduce((sum, child) => sum + child.count, 0),
      placedTop: Math.min(placedTop, ...childStats.map((child) => child.placedTop)),
      placedBottom: Math.max(placedBottom, ...childStats.map((child) => child.placedBottom)),
    };
  };
  const loads: Record<Side, { height: number; count: number }> = {
    left: { height: 0, count: 0 },
    right: { height: 0, count: 0 },
  };
  for (const c of root.children) {
    const side = nodes[c].side === 'left' ? 'left' : 'right';
    const branch = branchStats(c, 1, side);
    const placedHeight = Number.isFinite(branch.placedTop) ? branch.placedBottom - branch.placedTop : 0;
    loads[side].height += Math.max(branch.height, placedHeight) + 30;
    loads[side].count += branch.count;
  }
  if (loads.left.height !== loads.right.height) return loads.left.height < loads.right.height ? 'left' : 'right';
  if (loads.left.count !== loads.right.count) return loads.left.count < loads.right.count ? 'left' : 'right';
  return 'right';
}

export function addChild(
  doc: MindMapDoc,
  parentId: NodeId,
  text = DEFAULT_TOPIC_TEXT,
  index?: number,
): { doc: MindMapDoc; id: NodeId } {
  const parent = doc.nodes[parentId];
  if (!parent) return { doc, id: parentId };
  const id = createId();
  const nodes: Nodes = { ...doc.nodes };
  const node: MindNode = { id, text, parentId, children: [], checked: false };
  if (parentId === doc.rootId) node.side = pickSide(nodes, parent);
  const children = [...parent.children];
  children.splice(index ?? children.length, 0, id);
  nodes[id] = node;
  nodes[parentId] = { ...parent, children };
  syncAncestors(nodes, parentId);
  return { doc: withNodes(doc, nodes), id };
}

export function addSibling(doc: MindMapDoc, id: NodeId, text = DEFAULT_TOPIC_TEXT): { doc: MindMapDoc; id: NodeId } {
  const node = doc.nodes[id];
  if (!node?.parentId) return addChild(doc, id, text);
  const parent = doc.nodes[node.parentId];
  const result = addChild(doc, parent.id, text, parent.children.indexOf(id) + 1);
  return node.parentId !== doc.rootId && node.side ? { doc: setSide(result.doc, result.id, node.side), id: result.id } : result;
}

export function removeNode(doc: MindMapDoc, id: NodeId): MindMapDoc {
  const node = doc.nodes[id];
  if (!node?.parentId) return doc;
  const nodes: Nodes = { ...doc.nodes };
  for (const d of [id, ...descendantIds(nodes, id)]) delete nodes[d];
  const parent = nodes[node.parentId];
  nodes[parent.id] = { ...parent, children: parent.children.filter((c) => c !== id) };
  syncAncestors(nodes, parent.id);
  return withNodes(doc, nodes);
}

export function setText(doc: MindMapDoc, id: NodeId, text: string): MindMapDoc {
  if (id === doc.rootId) return setTitle(doc, text);
  const node = doc.nodes[id];
  if (!node || node.text === text) return doc;
  return withNodes(doc, { ...doc.nodes, [id]: { ...node, text } });
}

/** Sets the map title and the root topic text together. */
export function setTitle(doc: MindMapDoc, title: string): MindMapDoc {
  const root = doc.nodes[doc.rootId];
  if (doc.title === title && root.text === title) return doc;
  return { ...doc, title, nodes: { ...doc.nodes, [root.id]: { ...root, text: title } } };
}

/** Older maps stored the title and root text separately; the title wins. */
export const syncRootWithTitle = (doc: MindMapDoc): MindMapDoc => setTitle(doc, doc.title);

export type NodeAttributes = Pick<MindNode, 'note' | 'link' | 'dueDate' | 'bold' | 'textColor' | 'routine' | 'images'>;

/**
 * Sets optional attributes; `undefined`, `false`, empty strings and the default color remove the attribute.
 * (Status/completion are changed via `setStatus` / `setChecked` so parent/child propagation stays consistent.)
 */
export function setAttributes(doc: MindMapDoc, id: NodeId, attrs: Partial<NodeAttributes>): MindMapDoc {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next: MindNode = { ...node };
  let changed = false;
  for (const key of Object.keys(attrs) as (keyof NodeAttributes)[]) {
    const raw = attrs[key];
    const value = raw === 'black' || !raw || (Array.isArray(raw) && raw.length === 0) ? undefined : raw;
    if (next[key] === value) continue;
    changed = true;
    if (value === undefined) delete next[key];
    else Object.assign(next, { [key]: value });
  }
  return changed ? withNodes(doc, { ...doc.nodes, [id]: next }) : doc;
}

export function setChecked(doc: MindMapDoc, id: NodeId, checked: boolean): MindMapDoc {
  const node = doc.nodes[id];
  if (!node) return doc;
  const nodes: Nodes = { ...doc.nodes };
  for (const d of [id, ...descendantIds(nodes, id)]) nodes[d] = withChecked(nodes[d], checked);
  syncAncestors(nodes, node.parentId);
  return withNodes(doc, nodes);
}

export const displayStatus = (node: MindNode): DisplayStatus => (node.checked ? 'done' : (node.status ?? 'todo'));

/**
 * "完了" completes the task (and, as before, its descendants; parents complete when all children are done).
 * Other statuses un-complete the task if needed and then set only this task's status.
 */
export function setStatus(doc: MindMapDoc, id: NodeId, status: DisplayStatus): MindMapDoc {
  const node = doc.nodes[id];
  if (!node || displayStatus(node) === status) return doc;
  if (status === 'done') return setChecked(doc, id, true);
  const base = node.checked ? setChecked(doc, id, false) : doc;
  const cur = base.nodes[id];
  const next: MindNode = { ...cur, status };
  if (status === 'todo') delete next.status;
  return withNodes(base, { ...base.nodes, [id]: next });
}

export const toggleChecked = (doc: MindMapDoc, id: NodeId): MindMapDoc =>
  doc.nodes[id] ? setChecked(doc, id, !doc.nodes[id].checked) : doc;

export function setSide(doc: MindMapDoc, id: NodeId, side: Side): MindMapDoc {
  const node = doc.nodes[id];
  if (!node || !node.parentId || node.side === side) return doc;
  return withNodes(doc, { ...doc.nodes, [id]: { ...node, side } });
}

export function canMove(doc: MindMapDoc, id: NodeId, newParentId: NodeId): boolean {
  const node = doc.nodes[id];
  return (
    !!node?.parentId &&
    !!doc.nodes[newParentId] &&
    id !== newParentId &&
    node.parentId !== newParentId &&
    !isDescendant(doc.nodes, id, newParentId)
  );
}

/** Re-parents `id` (with its subtree) as the last child of `newParentId`. */
export function moveNode(doc: MindMapDoc, id: NodeId, newParentId: NodeId, side?: Side, positions?: Record<NodeId, { x: number; y: number }>): MindMapDoc {
  if (!canMove(doc, id, newParentId)) return doc;
  const nodes: Nodes = { ...doc.nodes };
  const node = nodes[id];
  const previousSide = sideOf(doc, id);
  const oldParent = nodes[node.parentId!];
  nodes[oldParent.id] = { ...oldParent, children: oldParent.children.filter((c) => c !== id) };
  const newParent = nodes[newParentId];
  const moved: MindNode = { ...node, parentId: newParentId };
  const nextSide = side ?? (newParentId === doc.rootId ? pickSide(nodes, newParent) : undefined);
  if (nextSide) moved.side = nextSide;
  else delete moved.side;
  nodes[id] = moved;
  // Keep the dropped location and subtree geometry. The layout reflows around
  // these user placements instead of snapping a reparented branch back.
  nodes[newParentId] = { ...newParent, children: [...newParent.children, id] };
  const directionChanged = nextSide !== undefined && previousSide !== nextSide;
  const descendants = directionChanged ? new Set(descendantIds(nodes, id)) : new Set<NodeId>();
  for (const descendant of descendants) {
    if (!nodes[descendant].position) continue;
    const { position: _position, ...rest } = nodes[descendant];
    nodes[descendant] = rest;
  }
  for (const [positionId, position] of Object.entries(positions ?? {})) {
    if (nodes[positionId] && !descendants.has(positionId)) nodes[positionId] = { ...nodes[positionId], position };
  }
  syncAncestors(nodes, oldParent.id);
  syncAncestors(nodes, newParentId);
  return withNodes(doc, nodes);
}
