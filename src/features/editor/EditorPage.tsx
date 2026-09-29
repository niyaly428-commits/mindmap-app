import { useEffect, useState, type MouseEvent } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { mapRepository } from '../../db/mapRepository';
import { navigate } from '../../lib/router';
import { useEditorStore } from '../../store/editorStore';
import { useAutosave } from '../../store/autosave';
import { MindMapCanvas } from './MindMapCanvas';
import { Popovers } from './Popovers';
import { TextStyleButtons } from './TopicNode';
import { closePopover } from './popoverStore';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export function EditorPage({ mapId }: { mapId: string }) {
  const doc = useEditorStore((s) => s.doc);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    closePopover();
    mapRepository.get(mapId).then((d) => {
      if (!alive) return;
      useEditorStore.getState().load(d ?? null);
      setStatus(d ? 'ready' : 'missing');
    });
    return () => {
      alive = false;
    };
  }, [mapId]);

  useAutosave();
  useKeyboardShortcuts();

  if (status === 'missing') {
    return (
      <div className="editor-missing">
        <p>マインドマップが見つかりませんでした。</p>
        <button className="btn" onClick={navigate.toList}>
          一覧へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <Toolbar />
      <div className="editor-canvas">
        {status === 'ready' && doc?.id === mapId && (
          <ReactFlowProvider>
            <MindMapCanvas doc={doc} />
          </ReactFlowProvider>
        )}
      </div>
      <ShortcutHelp />
      <Popovers />
    </div>
  );
}

function Toolbar() {
  const doc = useEditorStore((s) => s.doc);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedNode = useEditorStore((s) => (s.selectedId ? s.doc?.nodes[s.selectedId] : undefined));
  const titleDraft = useEditorStore((s) => s.titleDraft);
  const { undo, redo, addChild, addSibling, deleteNode, setTitle, setTitleDraft, toggleBold, setAttributes } =
    useEditorStore.getState();

  // The title is shared with the root topic: typing here shows up there immediately (and vice versa).
  const commitTitle = () => {
    const draft = useEditorStore.getState().titleDraft;
    if (draft === null) return;
    const t = draft.trim();
    if (t) setTitle(t);
    else setTitleDraft(null);
  };

  const isRoot = selectedId === doc?.rootId;
  // Buttons should not keep focus, so Space/Enter keep acting on the selected topic.
  const noFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <header className="toolbar">
      <button className="btn" onClick={navigate.toList} onMouseDown={noFocus}>
        ← 一覧
      </button>
      <input
        className="toolbar-title"
        value={titleDraft ?? doc?.title ?? ''}
        aria-label="マップのタイトル"
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setTitleDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <div className="toolbar-group">
        <button className="btn" onMouseDown={noFocus} onClick={() => addChild()} disabled={!selectedId}>
          子トピック
        </button>
        <button className="btn" onMouseDown={noFocus} onClick={() => addSibling()} disabled={!selectedId || isRoot}>
          兄弟トピック
        </button>
        <button className="btn" onMouseDown={noFocus} onClick={() => deleteNode()} disabled={!selectedId || isRoot}>
          削除
        </button>
      </div>
      <div className="toolbar-group text-style-group" aria-label="文字の装飾">
        <TextStyleButtons
          bold={!!selectedNode?.bold}
          textColor={selectedNode?.textColor}
          disabled={!selectedNode}
          onBold={() => toggleBold()}
          onColor={(c) => selectedId && setAttributes(selectedId, { textColor: c })}
        />
      </div>
      <div className="toolbar-group">
        <button className="btn" onMouseDown={noFocus} onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
          ↶ 元に戻す
        </button>
        <button className="btn" onMouseDown={noFocus} onClick={redo} disabled={!canRedo} title="やり直す (Ctrl+Y)">
          ↷ やり直す
        </button>
      </div>
      <span className="toolbar-status">自動保存</span>
    </header>
  );
}

function ShortcutHelp() {
  return (
    <div className="shortcut-help">
      <b>Tab</b> 子を追加 <b>Enter</b> 兄弟を追加 <b>F2</b>/ダブルクリック 編集 <b>Space</b> 完了/未着手 <b>Ctrl+B</b> 太字 <b>Delete</b> 削除{' '}
      <b>矢印</b> 移動 <b>Ctrl+Z</b>/<b>Ctrl+Y</b> 元に戻す/やり直す <b>右クリック</b> メモ・リンク・期日・ステータス ・
      ドラッグで他のトピックへ付け替え
    </div>
  );
}
