import { describe, expect, it } from 'vitest';
import {
  addChild,
  addSibling,
  canMove,
  createMap,
  moveNode,
  removeNode,
  setAttributes,
  setSide,
  setText,
  setTitle,
  syncRootWithTitle,
  toggleChecked,
} from './tree';
import type { MindMapDoc } from './types';

/** root -> a -> (a1, a2 -> a2x), root -> b */
function sample() {
  let doc = createMap('test');
  const root = doc.rootId;
  let r = addChild(doc, root, 'a');
  doc = r.doc;
  const a = r.id;
  r = addChild(doc, root, 'b');
  doc = r.doc;
  const b = r.id;
  r = addChild(doc, a, 'a1');
  doc = r.doc;
  const a1 = r.id;
  r = addChild(doc, a, 'a2');
  doc = r.doc;
  const a2 = r.id;
  r = addChild(doc, a2, 'a2x');
  doc = r.doc;
  const a2x = r.id;
  return { doc, root, a, b, a1, a2, a2x };
}

const checked = (doc: MindMapDoc, id: string) => doc.nodes[id].checked;

describe('tree operations', () => {
  it('creates a map with a root named after the title', () => {
    const doc = createMap('x');
    expect(doc.title).toBe('x');
    expect(doc.nodes[doc.rootId].parentId).toBeNull();
    expect(doc.nodes[doc.rootId].text).toBe('x');
  });

  it('keeps the map title and root text in sync both ways', () => {
    const { doc, root, a } = sample();
    const byTitle = setTitle(doc, 'タイトル');
    expect(byTitle.nodes[root].text).toBe('タイトル');
    const byRoot = setText(doc, root, '中央');
    expect(byRoot.title).toBe('中央');
    expect(setText(doc, a, 'z').title).toBe(doc.title);
    const legacy = { ...doc, nodes: { ...doc.nodes, [root]: { ...doc.nodes[root], text: 'old' } } };
    expect(syncRootWithTitle(legacy).nodes[root].text).toBe(doc.title);
    expect(syncRootWithTitle(doc)).toBe(doc);
  });

  it('sets and clears optional attributes (status / note / link)', () => {
    const { doc, a } = sample();
    const next = setAttributes(doc, a, { status: 'doing', note: 'memo', link: 'https://x.dev' });
    expect(next.nodes[a]).toMatchObject({ status: 'doing', note: 'memo', link: 'https://x.dev' });
    expect(setAttributes(next, a, { status: 'doing' })).toBe(next);
    const cleared = setAttributes(next, a, { status: undefined, note: '', link: undefined });
    expect('status' in cleared.nodes[a] || 'note' in cleared.nodes[a] || 'link' in cleared.nodes[a]).toBe(false);
  });

  it('adds children and balances main topics left/right', () => {
    const { doc, root, a, b, a1 } = sample();
    expect(doc.nodes[root].children).toEqual([a, b]);
    expect(doc.nodes[a].side).toBe('right');
    expect(doc.nodes[b].side).toBe('left');
    expect(doc.nodes[a1].side).toBeUndefined();
    expect(doc.nodes[a1].parentId).toBe(a);
  });

  it('adds a sibling right after the node, on the same side', () => {
    const { doc, root, a, b, a1, a2 } = sample();
    const r = addSibling(doc, a1);
    expect(r.doc.nodes[a].children).toEqual([a1, r.id, a2]);
    const r2 = addSibling(doc, b);
    expect(r2.doc.nodes[root].children).toEqual([a, b, r2.id]);
    expect(r2.doc.nodes[r2.id].side).toBe('left');
  });

  it('adding a sibling to the root adds a child', () => {
    const { doc, root } = sample();
    const r = addSibling(doc, root);
    expect(r.doc.nodes[r.id].parentId).toBe(root);
  });

  it('removes a node with its subtree, root cannot be removed', () => {
    const { doc, root, a, a2, a2x } = sample();
    const next = removeNode(doc, a2);
    expect(next.nodes[a2]).toBeUndefined();
    expect(next.nodes[a2x]).toBeUndefined();
    expect(next.nodes[a].children).not.toContain(a2);
    expect(removeNode(doc, root)).toBe(doc);
  });

  it('edits text immutably', () => {
    const { doc, a } = sample();
    const next = setText(doc, a, 'hello');
    expect(next.nodes[a].text).toBe('hello');
    expect(doc.nodes[a].text).toBe('a');
    expect(setText(next, a, 'hello')).toBe(next);
  });
});

describe('checkbox propagation', () => {
  it('checking a parent checks all descendants', () => {
    const { doc, a, a1, a2, a2x } = sample();
    const next = toggleChecked(doc, a);
    for (const id of [a, a1, a2, a2x]) expect(checked(next, id)).toBe(true);
  });

  it('unchecking a parent unchecks all descendants', () => {
    const { doc, a, a1, a2x } = sample();
    const next = toggleChecked(toggleChecked(doc, a), a);
    for (const id of [a, a1, a2x]) expect(checked(next, id)).toBe(false);
  });

  it('parent becomes checked when all children are checked (recursively)', () => {
    const { doc, a, a1, a2, a2x } = sample();
    let next = toggleChecked(doc, a2x);
    expect(checked(next, a2)).toBe(true);
    expect(checked(next, a)).toBe(false);
    next = toggleChecked(next, a1);
    expect(checked(next, a)).toBe(true);
  });

  it('unchecking a child unchecks ancestors', () => {
    const { doc, a, a2, a2x } = sample();
    const next = toggleChecked(toggleChecked(doc, a), a2x);
    expect(checked(next, a2)).toBe(false);
    expect(checked(next, a)).toBe(false);
  });

  it('adding a child to a checked parent unchecks it; deleting the last unchecked child checks it', () => {
    const { doc, a } = sample();
    const all = toggleChecked(doc, a);
    const r = addChild(all, a);
    expect(checked(r.doc, a)).toBe(false);
    expect(checked(removeNode(r.doc, r.id), a)).toBe(true);
  });
});

describe('moving nodes', () => {
  it('re-parents a subtree', () => {
    const { doc, a, b, a2, a2x } = sample();
    const next = moveNode(doc, a2, b);
    expect(next.nodes[a].children).not.toContain(a2);
    expect(next.nodes[b].children).toContain(a2);
    expect(next.nodes[a2].parentId).toBe(b);
    expect(next.nodes[a2x].parentId).toBe(a2);
  });

  it('rejects moving into itself or a descendant, or the root', () => {
    const { doc, root, a, a2x } = sample();
    expect(canMove(doc, a, a2x)).toBe(false);
    expect(canMove(doc, a, a)).toBe(false);
    expect(canMove(doc, root, a)).toBe(false);
    expect(moveNode(doc, a, a2x)).toBe(doc);
  });

  it('assigns side when moved to root and clears it otherwise', () => {
    const { doc, root, a, a1 } = sample();
    const toRoot = moveNode(doc, a1, root, 'left');
    expect(toRoot.nodes[a1].side).toBe('left');
    const back = moveNode(toRoot, a1, a);
    expect(back.nodes[a1].side).toBeUndefined();
  });

  it('recomputes checked state of old and new parents', () => {
    const { doc, a, b, a1, a2 } = sample();
    // a2 subtree checked, a1 not -> a unchecked. Move a1 away -> a becomes checked.
    const next = moveNode(toggleChecked(doc, a2), a1, b);
    expect(checked(next, a)).toBe(true);
  });

  it('switches side of a main topic', () => {
    const { doc, a, a1 } = sample();
    expect(setSide(doc, a, 'left').nodes[a].side).toBe('left');
    expect(setSide(doc, a1, 'left')).toBe(doc);
  });
});
