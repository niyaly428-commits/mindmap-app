import { useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { sideOf } from '../../model/tree';
import type { MindMapDoc, NodeId } from '../../model/types';
import { closePopover, openPopover, usePopoverStore } from './popoverStore';

const isTextInput = (el: EventTarget | null) =>
  typeof HTMLElement !== 'undefined' && el instanceof HTMLElement &&
  (el.isContentEditable ||
    ['TEXTAREA', 'SELECT'].includes(el.tagName) ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(el.type)));

/** Arrow-key navigation that follows the visual left/right layout. */
function neighbor(doc: MindMapDoc, id: NodeId, key: string): NodeId | null {
  const node = doc.nodes[id];
  const side = sideOf(doc, id);
  const firstChildOnSide = (s: 'left' | 'right') =>
    id === doc.rootId
      ? (node.children.find((c) => (doc.nodes[c].side ?? 'right') === s) ?? null)
      : (node.children[0] ?? null);

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (!node.parentId) return null;
    const siblings = doc.nodes[node.parentId].children.filter(
      (c) => node.parentId !== doc.rootId || (doc.nodes[c].side ?? 'right') === side,
    );
    return siblings[siblings.indexOf(id) + (key === 'ArrowUp' ? -1 : 1)] ?? null;
  }
  const outward = key === 'ArrowRight' ? 'right' : 'left';
  if (id === doc.rootId) return firstChildOnSide(outward);
  return side === outward ? (node.collapsed ? null : firstChildOnSide(outward)) : node.parentId;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleKeyboardShortcut(e);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export function handleKeyboardShortcut(e: KeyboardEvent) {
      if (e.isComposing || isTextInput(e.target)) return;
      // While a menu / memo / link popup is open, keys belong to it (Escape closes it).
      if (usePopoverStore.getState().popover) {
        if (e.key === 'Escape') closePopover();
        return;
      }
      const s = useEditorStore.getState();
      if (!s.doc) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod && key.toLowerCase() === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo();
      if (mod && key.toLowerCase() === 'y') return e.preventDefault(), s.redo();
      if (mod && key.toLowerCase() === 'b') return e.preventDefault(), s.toggleBold();
      if (mod && ['m', 'k', 'd'].includes(key.toLowerCase())) {
        if (!s.selectedId || s.selectedId === s.doc.rootId) return;
        e.preventDefault();
        openPopover({ kind: key.toLowerCase() === 'm' ? 'note' : key.toLowerCase() === 'k' ? 'link' : 'due', nodeId: s.selectedId });
        return;
      }
      if (mod && e.shiftKey && key.toLowerCase() === 'i') {
        e.preventDefault();
        window.dispatchEvent(new Event('mindmap:add-image'));
        return;
      }
      if (mod || e.altKey || !s.selectedId) return;

      const id = s.selectedId;
      switch (key) {
        case 'Tab':
          e.preventDefault();
          return s.addChild(id);
        case 'Enter':
          e.preventDefault();
          return s.addSibling(id);
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          return s.deleteNode(id);
        case ' ':
          e.preventDefault();
          return s.toggleChecked(id);
        case 'F2':
          e.preventDefault();
          return s.startEditing(id);
        case 'Escape':
          return s.select(null);
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const next = neighbor(s.doc, id, key);
          if (next) s.select(next);
          return;
        }
      }
}
