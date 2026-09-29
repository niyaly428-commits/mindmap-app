import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';
import { createMap } from '../model/tree';

const s = () => useEditorStore.getState();

describe('editorStore', () => {
  beforeEach(() => s().load(createMap('t')));

  it('adds a child, selects it and starts editing', () => {
    const root = s().doc!.rootId;
    s().addChild();
    const id = s().selectedId!;
    expect(id).not.toBe(root);
    expect(s().editingId).toBe(id);
    expect(s().doc!.nodes[root].children).toEqual([id]);
  });

  it('undo / redo restores document states', () => {
    s().addChild();
    const id = s().selectedId!;
    s().setText(id, 'hello');
    s().undo();
    expect(s().doc!.nodes[id].text).not.toBe('hello');
    s().undo();
    expect(s().doc!.nodes[id]).toBeUndefined();
    expect(s().selectedId).toBe(s().doc!.rootId);
    s().redo();
    s().redo();
    expect(s().doc!.nodes[id].text).toBe('hello');
    expect(s().future).toHaveLength(0);
  });

  it('a new change clears the redo stack', () => {
    s().addChild();
    s().undo();
    expect(s().future).toHaveLength(1);
    s().addChild();
    expect(s().future).toHaveLength(0);
  });

  it('no-op changes are not recorded', () => {
    s().toggleChecked(s().doc!.rootId);
    s().setTitle('t');
    expect(s().past).toHaveLength(0);
  });

  it('delete selects the next sibling, and root cannot be deleted', () => {
    const root = s().doc!.rootId;
    s().addChild(root);
    const first = s().selectedId!;
    s().addChild(root);
    const second = s().selectedId!;
    s().deleteNode(first);
    expect(s().selectedId).toBe(second);
    s().deleteNode(root);
    expect(s().doc!.nodes[root]).toBeDefined();
  });

  it('title changes update the root text and are undoable in one step', () => {
    s().setTitleDraft('入力中');
    expect(s().past).toHaveLength(0);
    s().setTitle('新タイトル');
    expect(s().titleDraft).toBeNull();
    expect(s().doc!.nodes[s().doc!.rootId].text).toBe('新タイトル');
    s().setText(s().doc!.rootId, '中央');
    expect(s().doc!.title).toBe('中央');
    s().undo();
    s().undo();
    expect(s().doc!.title).toBe('t');
    expect(s().doc!.nodes[s().doc!.rootId].text).toBe('t');
  });

  it('status / memo / link / due date / style changes are undoable', () => {
    s().addChild();
    const id = s().selectedId!;
    s().setStatus(id, 'waiting');
    s().setAttributes(id, { note: 'n', dueDate: '2026-10-03', textColor: 'blue' });
    s().toggleBold(id);
    expect(s().doc!.nodes[id]).toMatchObject({ status: 'waiting', note: 'n', dueDate: '2026-10-03', bold: true });
    s().undo();
    expect(s().doc!.nodes[id].bold).toBeUndefined();
    s().undo();
    expect(s().doc!.nodes[id].note).toBeUndefined();
    s().undo();
    expect(s().doc!.nodes[id].status).toBeUndefined();
    s().redo();
    expect(s().doc!.nodes[id].status).toBe('waiting');
  });

  it('memo auto-saves while typing are merged into one undo step', () => {
    s().addChild();
    const id = s().selectedId!;
    const before = s().past.length;
    for (const note of ['a', 'ab', 'abc']) s().setAttributes(id, { note }, { coalesce: `note:${id}` });
    expect(s().past.length).toBe(before + 1);
    s().endCoalesce();
    s().setAttributes(id, { note: 'abcd' }, { coalesce: `note:${id}` });
    expect(s().past.length).toBe(before + 2);
    s().undo();
    expect(s().doc!.nodes[id].note).toBe('abc');
    s().undo();
    expect(s().doc!.nodes[id].note).toBeUndefined();
  });

  it('toggles checked on the selected node', () => {
    s().addChild();
    const id = s().selectedId!;
    s().toggleChecked();
    expect(s().doc!.nodes[id].checked).toBe(true);
  });
});
