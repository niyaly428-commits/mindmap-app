import { create } from 'zustand';
import * as tree from '../model/tree';
import type { MindMapDoc, MindNode, NodeId, Side } from '../model/types';

const HISTORY_LIMIT = 200;

interface EditorState {
  doc: MindMapDoc | null;
  selectedId: NodeId | null;
  editingId: NodeId | null;
  /** Uncommitted title while typing in the toolbar or the root topic; shown live in both places. */
  titleDraft: string | null;
  past: MindMapDoc[];
  future: MindMapDoc[];

  load: (doc: MindMapDoc | null) => void;
  select: (id: NodeId | null) => void;
  startEditing: (id?: NodeId) => void;
  stopEditing: () => void;

  addChild: (parentId?: NodeId) => void;
  addSibling: (id?: NodeId) => void;
  deleteNode: (id?: NodeId) => void;
  toggleChecked: (id?: NodeId) => void;
  setText: (id: NodeId, text: string) => void;
  moveNode: (id: NodeId, newParentId: NodeId, side?: Side) => void;
  setSide: (id: NodeId, side: Side) => void;
  setTitle: (title: string) => void;
  setTitleDraft: (draft: string | null) => void;
  setAttributes: (id: NodeId, attrs: Partial<Pick<MindNode, 'status' | 'note' | 'link'>>) => void;

  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** Applies a document change and records it in history (no-op if nothing changed). */
  const commit = (next: MindMapDoc, patch: Partial<EditorState> = {}) => {
    const { doc, past } = get();
    if (!doc || next === doc) return set(patch);
    set({
      doc: { ...next, updatedAt: Date.now() },
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      ...patch,
    });
  };

  const target = (id?: NodeId) => id ?? get().selectedId ?? undefined;

  const restore = (doc: MindMapDoc, past: MindMapDoc[], future: MindMapDoc[]) => {
    const { selectedId } = get();
    set({
      doc: { ...doc, updatedAt: Date.now() },
      past,
      future,
      editingId: null,
      titleDraft: null,
      selectedId: selectedId && doc.nodes[selectedId] ? selectedId : doc.rootId,
    });
  };

  return {
    doc: null,
    selectedId: null,
    editingId: null,
    titleDraft: null,
    past: [],
    future: [],

    load: (doc) =>
      set({ doc, selectedId: doc?.rootId ?? null, editingId: null, titleDraft: null, past: [], future: [] }),
    select: (selectedId) => set({ selectedId, editingId: null }),
    startEditing: (id) => {
      const t = target(id);
      if (t) set({ selectedId: t, editingId: t });
    },
    stopEditing: () => set({ editingId: null }),

    addChild: (parentId) => {
      const { doc } = get();
      const p = target(parentId);
      if (!doc || !p) return;
      const r = tree.addChild(doc, p);
      commit(r.doc, { selectedId: r.id, editingId: r.id });
    },
    addSibling: (id) => {
      const { doc } = get();
      const t = target(id);
      if (!doc || !t) return;
      const r = tree.addSibling(doc, t);
      commit(r.doc, { selectedId: r.id, editingId: r.id });
    },
    deleteNode: (id) => {
      const { doc } = get();
      const t = target(id);
      if (!doc || !t || t === doc.rootId) return;
      const node = doc.nodes[t];
      const siblings = doc.nodes[node.parentId!].children;
      const i = siblings.indexOf(t);
      const nextSel = siblings[i + 1] ?? siblings[i - 1] ?? node.parentId;
      commit(tree.removeNode(doc, t), { selectedId: nextSel, editingId: null });
    },
    toggleChecked: (id) => {
      const { doc } = get();
      const t = target(id);
      if (doc && t && t !== doc.rootId) commit(tree.toggleChecked(doc, t));
    },
    setText: (id, text) => {
      const { doc } = get();
      if (doc) commit(tree.setText(doc, id, text));
    },
    moveNode: (id, newParentId, side) => {
      const { doc } = get();
      if (doc) commit(tree.moveNode(doc, id, newParentId, side));
    },
    setSide: (id, side) => {
      const { doc } = get();
      if (doc) commit(tree.setSide(doc, id, side));
    },
    setTitle: (title) => {
      const { doc } = get();
      if (doc) commit(tree.setTitle(doc, title), { titleDraft: null });
    },
    setTitleDraft: (titleDraft) => set({ titleDraft }),
    setAttributes: (id, attrs) => {
      const { doc } = get();
      if (doc) commit(tree.setAttributes(doc, id, attrs));
    },

    undo: () => {
      const { doc, past, future } = get();
      if (!doc || past.length === 0) return;
      restore(past[past.length - 1], past.slice(0, -1), [doc, ...future]);
    },
    redo: () => {
      const { doc, past, future } = get();
      if (!doc || future.length === 0) return;
      restore(future[0], [...past, doc], future.slice(1));
    },
  };
});
