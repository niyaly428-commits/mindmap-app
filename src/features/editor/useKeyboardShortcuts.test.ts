import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addChild, createMap } from '../../model/tree';
import { useEditorStore } from '../../store/editorStore';
import { usePopoverStore } from './popoverStore';
import { handleKeyboardShortcut } from './useKeyboardShortcuts';

const key = (props: Partial<KeyboardEvent> = {}) => ({
  key: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, target: null,
  preventDefault: vi.fn(), ...props,
}) as unknown as KeyboardEvent;

describe('editor shortcuts', () => {
  beforeEach(() => {
    const doc = createMap('test'); const child = addChild(doc, doc.rootId, 'task');
    useEditorStore.getState().load(child.doc); useEditorStore.getState().select(child.id);
    usePopoverStore.setState({ popover: null });
  });

  it.each([
    ['m', 'note'], ['k', 'link'], ['d', 'due'],
  ] as const)('Ctrl+%s opens the corresponding popup', (letter, kind) => {
    const event = key({ key: letter, ctrlKey: true });
    handleKeyboardShortcut(event);
    expect(usePopoverStore.getState().popover?.kind).toBe(kind);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('Ctrl+Shift+I requests image selection', () => {
    const dispatchEvent = vi.fn(); vi.stubGlobal('window', { dispatchEvent });
    const event = key({ key: 'I', ctrlKey: true, shiftKey: true });
    handleKeyboardShortcut(event);
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'mindmap:add-image' }));
    expect(event.preventDefault).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not intercept shortcuts during IME composition', () => {
    const event = key({ key: 'm', ctrlKey: true, isComposing: true });
    handleKeyboardShortcut(event);
    expect(usePopoverStore.getState().popover).toBeNull();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
