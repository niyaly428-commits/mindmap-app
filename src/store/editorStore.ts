import { create } from 'zustand';
import * as tree from '../model/tree';
import type { ColorTheme, DesignPreset, DisplayStatus, MindMapDoc, NodeId, Side, TextColor } from '../model/types';

const HISTORY_LIMIT = 200;

interface EditorState {
  doc: MindMapDoc | null;
  selectedId: NodeId | null;
  selectedIds: NodeId[];
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
  setDesignPreset: (value: DesignPreset) => void;
  setColorTheme: (value: ColorTheme) => void;
  setSelection: (ids: NodeId[]) => void;
  bulkSetColor: (value: TextColor) => void;
  bulkSetStatus: (value: DisplayStatus) => void;
  bulkSetRoutine: (value: boolean) => void;
  bulkDelete: () => void;
  setTitle: (title: string) => void;
  setTitleDraft: (draft: string | null) => void;
  /**
   * `coalesce`: consecutive changes with the same key (e.g. memo auto-saves while typing)
   * are merged into a single undo step.
   */
  setAttributes: (id: NodeId, attrs: Partial<tree.NodeAttributes>, options?: { coalesce?: string }) => void;
  setStatus: (id: NodeId, status: DisplayStatus) => void;
  toggleBold: (id?: NodeId) => void;
  /** Ends the current coalescing group (e.g. when the memo popup closes). */
  endCoalesce: () => void;

  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>()((set, get) => {
  let coalesceKey: string | null = null;

  /** Applies a document change and records it in history (no-op if nothing changed). */
  const commit = (next: MindMapDoc, patch: Partial<EditorState> = {}, coalesce?: string) => {
    const { doc, past } = get();
    if (!doc || next === doc) return set(patch);
    const merge = !!coalesce && coalesce === coalesceKey && past.length > 0;
    coalesceKey = coalesce ?? null;
    set({
      doc: { ...next, updatedAt: Date.now() },
      past: merge ? past : [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      ...patch,
    });
  };

  const target = (id?: NodeId) => id ?? get().selectedId ?? undefined;

  const restore = (doc: MindMapDoc, past: MindMapDoc[], future: MindMapDoc[]) => {
    const { selectedId } = get();
    coalesceKey = null;
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
    selectedIds: [],
    editingId: null,
    titleDraft: null,
    past: [],
    future: [],

    load: (doc) => {
      coalesceKey = null;
      set({ doc, selectedId: doc?.rootId ?? null, selectedIds: [], editingId: null, titleDraft: null, past: [], future: [] });
    },
    select: (selectedId) => set({ selectedId, selectedIds: selectedId && selectedId !== get().doc?.rootId ? [selectedId] : [], editingId: null }),
    setSelection: (selectedIds) => set({ selectedIds, selectedId: selectedIds.at(-1) ?? null, editingId: null }),
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
    setDesignPreset: (value) => { const { doc } = get(); if (doc && doc.designPreset !== value) commit({ ...doc, designPreset: value }); },
    setColorTheme: (value) => { const { doc } = get(); if (doc && doc.colorTheme !== value) commit({ ...doc, colorTheme: value }); },
    bulkSetColor: (value) => {
      const { doc, selectedIds } = get(); if (!doc) return;
      let next = doc; for (const id of selectedIds.filter((id) => id !== doc.rootId)) next = tree.setAttributes(next, id, { textColor: value }); commit(next);
    },
    bulkSetStatus: (value) => {
      const { doc, selectedIds } = get(); if (!doc) return;
      let next = doc; for (const id of selectedIds.filter((id) => id !== doc.rootId)) next = tree.setStatus(next, id, value); commit(next);
    },
    bulkSetRoutine: (value) => {
      const { doc, selectedIds } = get(); if (!doc) return;
      let next = doc; for (const id of selectedIds.filter((id) => id !== doc.rootId)) next = tree.setAttributes(next, id, { routine: value }); commit(next);
    },
    bulkDelete: () => {
      const { doc, selectedIds } = get(); if (!doc) return;
      const roots = selectedIds.filter((id) => id !== doc.rootId && !selectedIds.some((other) => other !== id && tree.isDescendant(doc.nodes, other, id)));
      let next = doc; for (const id of roots) next = tree.removeNode(next, id); commit(next, { selectedIds: [], selectedId: next.rootId });
    },
    setTitle: (title) => {
      const { doc } = get();
      if (doc) commit(tree.setTitle(doc, title), { titleDraft: null });
    },
    setTitleDraft: (titleDraft) => set({ titleDraft }),
    setAttributes: (id, attrs, options) => {
      const { doc } = get();
      if (doc) commit(tree.setAttributes(doc, id, attrs), {}, options?.coalesce);
    },
    setStatus: (id, status) => {
      const { doc } = get();
      if (doc && id !== doc.rootId) commit(tree.setStatus(doc, id, status));
    },
    toggleBold: (id) => {
      const { doc } = get();
      const t = target(id);
      if (doc && t && doc.nodes[t]) commit(tree.setAttributes(doc, t, { bold: !doc.nodes[t].bold }));
    },
    endCoalesce: () => {
      coalesceKey = null;
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
