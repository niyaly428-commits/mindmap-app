import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { normalizeUrl, splitUrls } from '../../lib/url';
import type { NodeId } from '../../model/types';
import { closePopover, openPopover, topicRect, usePopoverStore } from './popoverStore';
import { LinkIcon, NoteIcon, STATUS_LABELS, STATUS_ORDER, StatusIcon } from './icons';

export function Popovers() {
  const popover = usePopoverStore((s) => s.popover);
  const exists = useEditorStore((s) => !!popover && !!s.doc?.nodes[popover.nodeId]);
  if (!popover || !exists) return null;
  switch (popover.kind) {
    case 'menu':
      return <ContextMenu key={popover.nodeId} nodeId={popover.nodeId} x={popover.x} y={popover.y} />;
    case 'note':
      return <NotePopover key={popover.nodeId} nodeId={popover.nodeId} initialMode={popover.mode} />;
    case 'link':
      return <LinkPopover key={popover.nodeId} nodeId={popover.nodeId} />;
  }
}

/** Invisible full-screen layer: clicking outside the popup closes it. */
function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="popover-backdrop"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
  );
}

function ContextMenu({ nodeId, x, y }: { nodeId: NodeId; x: number; y: number }) {
  const status = useEditorStore((s) => s.doc!.nodes[nodeId].status);
  const [subOpen, setSubOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 180)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  const setStatus = (s: (typeof STATUS_ORDER)[number] | undefined) => {
    useEditorStore.getState().setAttributes(nodeId, { status: s });
    closePopover();
  };

  return (
    <>
      <Backdrop onClose={closePopover} />
      <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
        <button role="menuitem" className="menu-item" onClick={() => openPopover({ kind: 'note', nodeId, mode: 'edit' })}>
          <NoteIcon /> メモ
        </button>
        <button role="menuitem" className="menu-item" onClick={() => openPopover({ kind: 'link', nodeId })}>
          <LinkIcon /> リンク
        </button>
        <div className="menu-sub" onMouseEnter={() => setSubOpen(true)} onMouseLeave={() => setSubOpen(false)}>
          <button
            role="menuitem"
            className="menu-item"
            aria-haspopup="menu"
            aria-expanded={subOpen}
            onClick={() => setSubOpen(true)}
          >
            <StatusIcon status={status ?? 'todo'} size={14} /> ステータス <span className="menu-arrow">›</span>
          </button>
          {subOpen && (
            <div className="context-menu submenu" role="menu">
              {STATUS_ORDER.map((s) => (
                <button key={s} role="menuitemradio" aria-checked={status === s} className="menu-item" onClick={() => setStatus(s)}>
                  <StatusIcon status={s} size={14} /> {STATUS_LABELS[s]}
                  {status === s && <span className="menu-check">✓</span>}
                </button>
              ))}
              {status && (
                <>
                  <div className="menu-sep" />
                  <button role="menuitem" className="menu-item" onClick={() => setStatus(undefined)}>
                    ステータスを外す
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Positions a popup just below (or above, if there's no room) the topic. */
function useAnchor(nodeId: NodeId, width: number): CSSProperties {
  const [style] = useState<CSSProperties>(() => {
    const r = topicRect(nodeId) ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 3, 0, 0);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    return below > 240 || below > r.top
      ? { left, top: r.bottom + 8, width, maxHeight: below - 24 }
      : { left, bottom: window.innerHeight - r.top + 8, width, maxHeight: r.top - 24 };
  });
  return style;
}

function PopoverFrame({ nodeId, width, onClose, children }: { nodeId: NodeId; width: number; onClose: () => void; children: ReactNode }) {
  const style = useAnchor(nodeId, width);
  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="popover" style={style} role="dialog">
        {children}
      </div>
    </>
  );
}

export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitUrls(text).map((p, i) =>
        p.type === 'url' ? (
          <a key={i} href={p.value} target="_blank" rel="noopener noreferrer">
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

function NotePopover({ nodeId, initialMode }: { nodeId: NodeId; initialMode: 'view' | 'edit' }) {
  const note = useEditorStore((s) => s.doc!.nodes[nodeId].note ?? '');
  const [mode, setMode] = useState(note ? initialMode : 'edit');
  const [draft, setDraft] = useState(note);

  const save = () => useEditorStore.getState().setAttributes(nodeId, { note: draft.trim() ? draft.replace(/\s+$/, '') : undefined });
  const saveAndClose = () => {
    if (mode === 'edit') save();
    closePopover();
  };

  return (
    <PopoverFrame nodeId={nodeId} width={420} onClose={saveAndClose}>
      <div className="popover-header">
        <NoteIcon /> メモ
      </div>
      {mode === 'view' ? (
        <>
          <div className="note-view" onDoubleClick={() => setMode('edit')}>
            <LinkifiedText text={note} />
          </div>
          <div className="popover-actions">
            <button className="btn" onClick={closePopover}>
              閉じる
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft(note);
                setMode('edit');
              }}
            >
              編集
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            className="note-editor"
            autoFocus
            value={draft}
            placeholder="メモを入力（URLも記載できます）"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                closePopover();
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveAndClose();
              }
            }}
          />
          <div className="popover-actions">
            {note && (
              <button
                className="btn danger-text"
                onClick={() => {
                  useEditorStore.getState().setAttributes(nodeId, { note: undefined });
                  closePopover();
                }}
              >
                削除
              </button>
            )}
            <span className="popover-hint">Ctrl+Enter で保存</span>
            <button className="btn" onClick={closePopover}>
              キャンセル
            </button>
            <button className="btn btn-primary" onClick={saveAndClose}>
              保存
            </button>
          </div>
        </>
      )}
    </PopoverFrame>
  );
}

function LinkPopover({ nodeId }: { nodeId: NodeId }) {
  const link = useEditorStore((s) => s.doc!.nodes[nodeId].link ?? '');
  const [draft, setDraft] = useState(link);
  const [error, setError] = useState(false);

  const save = () => {
    if (!draft.trim()) {
      useEditorStore.getState().setAttributes(nodeId, { link: undefined });
      return closePopover();
    }
    const url = normalizeUrl(draft);
    if (!url) return setError(true);
    useEditorStore.getState().setAttributes(nodeId, { link: url });
    closePopover();
  };

  return (
    <PopoverFrame nodeId={nodeId} width={420} onClose={closePopover}>
      <div className="popover-header">
        <LinkIcon /> リンク
      </div>
      <input
        className="link-input"
        autoFocus
        value={draft}
        placeholder="https://..."
        aria-label="リンクURL"
        onChange={(e) => {
          setDraft(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') closePopover();
        }}
      />
      {error && <div className="popover-error">http(s) のURLを入力してください</div>}
      <div className="popover-actions">
        {link && (
          <>
            <button
              className="btn danger-text"
              onClick={() => {
                useEditorStore.getState().setAttributes(nodeId, { link: undefined });
                closePopover();
              }}
            >
              削除
            </button>
            <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
              開く
            </a>
          </>
        )}
        <span className="popover-hint" />
        <button className="btn" onClick={closePopover}>
          キャンセル
        </button>
        <button className="btn btn-primary" onClick={save}>
          保存
        </button>
      </div>
    </PopoverFrame>
  );
}
