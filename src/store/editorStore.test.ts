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

  it('toggles checked on the selected node', () => {
    s().addChild();
    const id = s().selectedId!;
    s().toggleChecked();
    expect(s().doc!.nodes[id].checked).toBe(true);
  });
});
