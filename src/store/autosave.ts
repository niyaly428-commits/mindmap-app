import { useEffect } from 'react';
import { mapRepository, type MapRepository } from '../db/mapRepository';
import { useEditorStore } from './editorStore';
import type { MindMapDoc } from '../model/types';

export const AUTOSAVE_DELAY_MS = 300;

/** Saves the document shortly after every change; flushes on page hide / unmount. */
export function startAutosave(repo: MapRepository = mapRepository, delay = AUTOSAVE_DELAY_MS): () => void {
  let pending: MindMapDoc | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const doc = pending;
    pending = null;
    repo.save(doc).catch((e) => console.error('自動保存に失敗しました', e));
  };

  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    // Only save edits to an already-loaded map (not the initial load).
    if (!state.doc || state.doc === prev.doc || prev.doc?.id !== state.doc.id) return;
    pending = state.doc;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  const onHide = () => document.visibilityState === 'hidden' && flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
    flush();
  };
}

export function useAutosave() {
  useEffect(() => startAutosave(), []);
}
