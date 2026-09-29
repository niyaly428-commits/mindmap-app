import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { mapRepository } from '../../db/mapRepository';
import { navigate } from '../../lib/router';
import { useEditorStore } from '../../store/editorStore';
import { useAutosave } from '../../store/autosave';
import type { ColorTheme, DesignPreset } from '../../model/types';
import { MindMapCanvas } from './MindMapCanvas';
import { Popovers } from './Popovers';
import { TextStyleButtons } from './TopicNode';
import { closePopover } from './popoverStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { printMap } from './pdfExport';

export function EditorPage({ mapId }: { mapId: string }) {
  const doc = useEditorStore((s) => s.doc);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  useEffect(() => {
    let alive = true;
    closePopover();
    mapRepository.get(mapId).then((d) => { if (alive) { useEditorStore.getState().load(d ?? null); setStatus(d ? 'ready' : 'missing'); } });
    return () => { alive = false; };
  }, [mapId]);
  useAutosave();
  useKeyboardShortcuts();
  if (status === 'missing') return <div className="editor-missing"><p>マップが見つかりませんでした。</p><button className="btn" onClick={navigate.toList}>一覧へ戻る</button></div>;
  return <div className={`editor-page preset-${doc?.designPreset ?? 'soft-organic'} theme-${doc?.colorTheme ?? 'calm-blue'}`}><Toolbar /><div className="editor-canvas">{status === 'ready' && doc?.id === mapId && <ReactFlowProvider><MindMapCanvas doc={doc} /></ReactFlowProvider>}</div><ShortcutHelp /><Popovers /></div>;
}

function Toolbar() {
  const doc = useEditorStore((s) => s.doc);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const selectedNode = selectedId ? doc?.nodes[selectedId] : undefined;
  const titleDraft = useEditorStore((s) => s.titleDraft);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const imageInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const onAddImage = () => imageInput.current?.click(); window.addEventListener('mindmap:add-image', onAddImage); return () => window.removeEventListener('mindmap:add-image', onAddImage); }, []);
  const store = useEditorStore.getState();
  const noFocus = (e: MouseEvent) => e.preventDefault();
  const commitTitle = () => { const draft = useEditorStore.getState().titleDraft; if (draft === null) return; if (draft.trim()) store.setTitle(draft.trim()); else store.setTitleDraft(null); };
  const addImages = async (files: FileList | null) => {
    if (!files || !selectedId || !doc) return;
    const existing = doc.nodes[selectedId]?.images ?? [];
    const all = Array.from(files);
    if (all.some((f) => f.size > 10 * 1024 * 1024)) alert('画像は1枚あたり10 MB以下にしてください。');
    const valid = all.filter((f) => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024).slice(0, Math.max(0, 5 - existing.length));
    const ids = await Promise.all(valid.map((file) => mapRepository.addImage(doc.id, file)));
    if (ids.length) useEditorStore.getState().setAttributes(selectedId, { images: [...existing, ...ids] });
  };
  return <header className="toolbar">
    <button className="btn" onMouseDown={noFocus} onClick={navigate.toList}>← 一覧</button>
    <input className="toolbar-title" aria-label="マップのタイトル" value={titleDraft ?? doc?.title ?? ''} onChange={(e) => store.setTitleDraft(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { store.setTitleDraft(null); e.currentTarget.blur(); } }} />
    <div className="toolbar-group"><button className="btn" onMouseDown={noFocus} onClick={() => store.addChild()} disabled={!selectedId}>子タスク</button><button className="btn" onMouseDown={noFocus} onClick={() => store.addSibling()} disabled={!selectedId || selectedId === doc?.rootId}>兄弟タスク</button><button className="btn" onMouseDown={noFocus} onClick={() => store.deleteNode()} disabled={!selectedId || selectedId === doc?.rootId}>削除</button></div>
    <div className="toolbar-group"><button className="btn" onMouseDown={noFocus} onClick={store.undo} disabled={!canUndo}>Undo</button><button className="btn" onMouseDown={noFocus} onClick={store.redo} disabled={!canRedo}>Redo</button></div>
    <div className="toolbar-group text-style-group"><TextStyleButtons bold={!!selectedNode?.bold} textColor={selectedNode?.textColor} disabled={!selectedNode} onBold={() => store.toggleBold()} onColor={(color) => selectedId && store.setAttributes(selectedId, { textColor: color })} /></div>
    <div className="toolbar-group settings-group"><label>Design<select aria-label="Design preset" value={doc?.designPreset ?? 'soft-organic'} onChange={(e: ChangeEvent<HTMLSelectElement>) => store.setDesignPreset(e.target.value as DesignPreset)}><option value="soft-organic">Soft / Organic</option><option value="clean-structured">Clean / Structured</option><option value="soft-analytical">Soft Analytical</option></select></label><label>Theme<select aria-label="Color theme" value={doc?.colorTheme ?? 'calm-blue'} onChange={(e: ChangeEvent<HTMLSelectElement>) => store.setColorTheme(e.target.value as ColorTheme)}><option value="calm-blue">Calm Blue</option><option value="natural">Natural</option><option value="elegant">Elegant</option><option value="fresh">Fresh</option><option value="monochrome">Monochrome</option></select></label></div>
    <div className="toolbar-group"><label className="btn file-button">画像追加<input ref={imageInput} aria-label="画像追加" hidden type="file" accept="image/*" multiple onChange={(e) => { void addImages(e.target.files); e.currentTarget.value = ''; }} /></label><button className="btn" onMouseDown={noFocus} onClick={() => doc && void printMap(doc)}>PDF出力</button></div>
    {selectedIds.length > 1 && <div className="toolbar-group bulk-tools"><span>{selectedIds.length}件選択</span><select aria-label="一括ステータス" defaultValue="" onChange={(e) => { if (e.target.value) store.bulkSetStatus(e.target.value as 'todo'|'doing'|'waiting'|'done'); e.currentTarget.value = ''; }}><option value="" disabled>状態</option><option value="todo">未着手</option><option value="doing">進行中</option><option value="waiting">待ち</option><option value="done">完了</option></select><select aria-label="一括文字色" defaultValue="" onChange={(e) => { if (e.target.value) store.bulkSetColor(e.target.value as 'black'|'red'|'blue'|'orange'); e.currentTarget.value = ''; }}><option value="" disabled>文字色</option><option value="black">黒</option><option value="red">赤</option><option value="blue">青</option><option value="orange">橙</option></select><button className="btn" onClick={() => store.bulkSetRoutine(true)}>ルーティンON</button><button className="btn" onClick={() => store.bulkSetRoutine(false)}>OFF</button><button className="btn danger-text" onClick={() => confirm(`${selectedIds.length}件を削除しますか？`) && store.bulkDelete()}>一括削除</button></div>}
    <span className="toolbar-status">自動保存</span>
  </header>;
}

function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === '?' && !e.isComposing && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setOpen(true); } if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  return <><button className="shortcut-help-trigger" onClick={() => setOpen(true)}>ショートカット (?)</button>{open && <div className="shortcut-modal-backdrop" onClick={() => setOpen(false)}><section className="shortcut-modal" role="dialog" aria-label="ショートカット一覧" onClick={(e) => e.stopPropagation()}><button className="lightbox-close" onClick={() => setOpen(false)}>×</button><h2>キーボードショートカット</h2><p>Tab 子タスク　Enter 兄弟タスク　F2 / ダブルクリック 編集　Space 完了</p><p>Delete 削除　Ctrl+Z Undo　Ctrl+Y Redo　Ctrl+B 太字</p><p>Ctrl+M メモ　Ctrl+K リンク　Ctrl+D 期日　Ctrl+Shift+I 画像</p><p>? 一覧　Esc 閉じる　ドラッグで矩形選択</p></section></div>}</>;
}
