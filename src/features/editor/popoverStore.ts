import { create } from 'zustand';
import type { NodeId } from '../../model/types';

export type Popover =
  | { kind: 'menu'; nodeId: NodeId; x: number; y: number }
  | { kind: 'note'; nodeId: NodeId }
  | { kind: 'link'; nodeId: NodeId }
  | { kind: 'due'; nodeId: NodeId };

/** Context menu / memo / link / due date popups (UI-only state, not saved). */
export const usePopoverStore = create<{ popover: Popover | null }>()(() => ({ popover: null }));

export const openPopover = (popover: Popover) => usePopoverStore.setState({ popover });
export const closePopover = () => usePopoverStore.setState({ popover: null });

/** Screen rect of a rendered topic, used to anchor popups below it. */
export const topicRect = (id: NodeId): DOMRect | undefined =>
  document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
