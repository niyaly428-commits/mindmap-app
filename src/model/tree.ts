import type { MindMapDoc, MindNode, NodeId, Side } from './types';

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
  const branch = branchOf(doc, id);
  return branch ? (doc.nodes[branch].side ?? 'right') : null;
}

/** Parent is checked iff it has children and all of them are checked. Walks up from `startId`. */
function syncAncestors(nodes: Nodes, startId: NodeId | null): void {
  let cur = startId;
  while (cur) {
    const node = nodes[cur];
    if (node.children.length > 0) {
      const all = node.children.every((c) => nodes[c].checked);
      if (all !== node.checked) nodes[cur] = { ...node, checked: all };
    }
    cur = node.parentId;
  }
}

function pickSide(nodes: Nodes, root: MindNode): Side {
  let right = 0;
  let left = 0;
  for (const c of root.children) (nodes[c].side === 'left' ? left++ : right++);
  return left < right ? 'left' : 'right';
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
  return node.side ? { doc: setSide(result.doc, result.id, node.side), id: result.id } : result;
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

type NodeAttributes = Pick<MindNode, 'status' | 'note' | 'link'>;

/** Sets optional attributes; `undefined` or empty strings remove the attribute. */
export function setAttributes(doc: MindMapDoc, id: NodeId, attrs: Partial<NodeAttributes>): MindMapDoc {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next: MindNode = { ...node };
  let changed = false;
  for (const key of Object.keys(attrs) as (keyof NodeAttributes)[]) {
    const value = attrs[key] || undefined;
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
  for (const d of [id, ...descendantIds(nodes, id)]) nodes[d] = { ...nodes[d], checked };
  syncAncestors(nodes, node.parentId);
  return withNodes(doc, nodes);
}

export const toggleChecked = (doc: MindMapDoc, id: NodeId): MindMapDoc =>
  doc.nodes[id] ? setChecked(doc, id, !doc.nodes[id].checked) : doc;

export function setSide(doc: MindMapDoc, id: NodeId, side: Side): MindMapDoc {
  const node = doc.nodes[id];
  if (!node || node.parentId !== doc.rootId || node.side === side) return doc;
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
export function moveNode(doc: MindMapDoc, id: NodeId, newParentId: NodeId, side?: Side): MindMapDoc {
  if (!canMove(doc, id, newParentId)) return doc;
  const nodes: Nodes = { ...doc.nodes };
  const node = nodes[id];
  const oldParent = nodes[node.parentId!];
  nodes[oldParent.id] = { ...oldParent, children: oldParent.children.filter((c) => c !== id) };
  const newParent = nodes[newParentId];
  const moved: MindNode = { ...node, parentId: newParentId };
  if (newParentId === doc.rootId) moved.side = side ?? pickSide(nodes, newParent);
  else delete moved.side;
  nodes[id] = moved;
  nodes[newParentId] = { ...newParent, children: [...newParent.children, id] };
  syncAncestors(nodes, oldParent.id);
  syncAncestors(nodes, newParentId);
  return withNodes(doc, nodes);
}
