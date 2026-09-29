import { create } from 'zustand';
import type { NodeId } from '../../model/types';

/** Transient UI state while dragging a topic (not part of the document / history). */
export const useDragStore = create<{
  draggingIds: Set<NodeId>;
  dropTargetId: NodeId | null;
}>()(() => ({ draggingIds: new Set(), dropTargetId: null }));
