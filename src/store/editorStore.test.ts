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

  it('persists independent presets and themes in the document', () => {
    s().setDesignPreset('soft-analytical');
    s().setColorTheme('natural');
    expect(s().doc).toMatchObject({ designPreset: 'soft-analytical', colorTheme: 'natural' });
    s().undo(); expect(s().doc!.colorTheme).toBeUndefined();
    s().undo(); expect(s().doc!.designPreset).toBeUndefined();
  });

  it('applies bulk edits as one undoable operation', () => {
    s().addChild(); const a = s().selectedId!;
    s().addSibling(a); const b = s().selectedId!;
    s().setSelection([a, b]);
    s().bulkSetColor('red'); s().undo();
    expect(s().doc!.nodes[a].textColor).toBeUndefined();
    s().bulkSetStatus('waiting'); s().bulkSetRoutine(true);
    expect(s().doc!.nodes[a]).toMatchObject({ status: 'waiting', routine: true });
    s().undo(); expect(s().doc!.nodes[a].routine).toBeUndefined();
    s().setSelection([a, b]); s().bulkDelete();
    expect(s().doc!.nodes[a]).toBeUndefined(); expect(s().doc!.nodes[b]).toBeUndefined();
    s().undo(); expect(s().doc!.nodes[a]).toBeDefined(); expect(s().doc!.nodes[b]).toBeDefined();
  });

  it('applies one bulk status change to every selected task in one undo and redo step', () => {
    s().addChild(); const first = s().selectedId!;
    s().addSibling(first); const second = s().selectedId!;
    s().setSelection([first, second]);
    const history = s().past.length;
    s().bulkSetStatus('waiting');
    expect(s().past).toHaveLength(history + 1);
    expect(s().doc!.nodes[first].status).toBe('waiting');
    expect(s().doc!.nodes[second].status).toBe('waiting');
    s().undo();
    expect(s().doc!.nodes[first].status).toBeUndefined();
    expect(s().doc!.nodes[second].status).toBeUndefined();
    s().redo();
    expect(s().doc!.nodes[first].status).toBe('waiting');
    expect(s().doc!.nodes[second].status).toBe('waiting');

    s().bulkSetStatus('done');
    expect(s().doc!.nodes[first].checked).toBe(true);
    expect(s().doc!.nodes[second].checked).toBe(true);
    s().undo();
    expect(s().doc!.nodes[first].checked).toBe(false);
    expect(s().doc!.nodes[second].checked).toBe(false);
    s().redo();
    expect(s().doc!.nodes[first].checked).toBe(true);
    expect(s().doc!.nodes[second].checked).toBe(true);
  });

  it('applies routine updates to one selected task only', () => {
    s().addChild(); const first = s().selectedId!;
    s().addSibling(first); const second = s().selectedId!;
    s().setSelection([first]);
    s().bulkSetRoutine(true);
    expect(s().doc!.nodes[first].routine).toBe(true);
    expect(s().doc!.nodes[second].routine).toBeUndefined();
    s().undo(); expect(s().doc!.nodes[first].routine).toBeUndefined();
  });

  it('applies routine updates to every selected task in one undo and redo step', () => {
    s().addChild(); const first = s().selectedId!;
    s().addSibling(first); const second = s().selectedId!;
    s().setSelection([first, second]);
    const history = s().past.length;
    s().bulkSetRoutine(true);
    expect(s().past).toHaveLength(history + 1);
    expect(s().doc!.nodes[first].routine).toBe(true);
    expect(s().doc!.nodes[second].routine).toBe(true);
    s().undo();
    expect(s().doc!.nodes[first].routine).toBeUndefined();
    expect(s().doc!.nodes[second].routine).toBeUndefined();
    s().redo();
    expect(s().doc!.nodes[first].routine).toBe(true);
    expect(s().doc!.nodes[second].routine).toBe(true);
  });

  it('applies one due date to all selected tasks in one undo and redo step without clearing selection', () => {
    s().addChild(); const first = s().selectedId!;
    s().addSibling(first); const second = s().selectedId!;
    s().setSelection([first, second]);
    const history = s().past.length;
    s().bulkSetDueDate('2026-10-07');
    expect(s().past).toHaveLength(history + 1);
    expect(s().doc!.nodes[first].dueDate).toBe('2026-10-07');
    expect(s().doc!.nodes[second].dueDate).toBe('2026-10-07');
    expect(s().selectedIds).toEqual([first, second]);
    s().undo();
    expect(s().doc!.nodes[first].dueDate).toBeUndefined();
    expect(s().doc!.nodes[second].dueDate).toBeUndefined();
    s().redo();
    expect(s().doc!.nodes[first].dueDate).toBe('2026-10-07');
    expect(s().doc!.nodes[second].dueDate).toBe('2026-10-07');
  });

  it('stores dragged positions as one undoable map change', () => {
    s().addChild(); const id = s().selectedId!;
    const history = s().past.length;
    s().setPositions({ [id]: { x: 120, y: -40 } });
    expect(s().doc!.nodes[id].position).toEqual({ x: 120, y: -40 });
    expect(s().past).toHaveLength(history + 1);
    s().undo(); expect(s().doc!.nodes[id].position).toBeUndefined();
    s().redo(); expect(s().doc!.nodes[id].position).toEqual({ x: 120, y: -40 });
  });

  it('reflows descendants when a manually dragged node changes branch direction', () => {
    s().addChild(); const parent = s().selectedId!;
    s().addChild(parent); const child = s().selectedId!;
    s().addChild(child); const grandchild = s().selectedId!;
    s().setPositions({
      [parent]: { x: 100, y: 0 },
      [child]: { x: 250, y: 0 },
      [grandchild]: { x: 400, y: 0 },
    });
    const history = s().past.length;
    s().setPositions(
      { [child]: { x: -250, y: 80 }, [grandchild]: { x: -100, y: 80 } },
      { id: child, side: 'left' },
    );
    expect(s().doc!.nodes[child].side).toBe('left');
    expect(s().doc!.nodes[child].position).toEqual({ x: -250, y: 80 });
    expect(s().doc!.nodes[grandchild].position).toBeUndefined();
    expect(s().past).toHaveLength(history + 1);
    s().undo();
    expect(s().doc!.nodes[child].side).toBeUndefined();
    expect(s().doc!.nodes[grandchild].position).toEqual({ x: 400, y: 0 });
    s().redo();
    expect(s().doc!.nodes[child].side).toBe('left');
    expect(s().doc!.nodes[grandchild].position).toBeUndefined();
  });
});
