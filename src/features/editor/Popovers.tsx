import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { normalizeUrl, splitUrls } from '../../lib/url';
import { formatDue } from '../../lib/date';
import { displayStatus } from '../../model/tree';
import type { DisplayStatus, NodeId } from '../../model/types';
import { closePopover, openPopover, topicRect, usePopoverStore } from './popoverStore';
import { CalendarIcon, LinkIcon, NoteIcon, STATUS_LABELS, STATUS_ORDER, StatusIcon } from './icons';

export const NOTE_AUTOSAVE_MS = 400;

export function Popovers() {
  const popover = usePopoverStore((s) => s.popover);
  const exists = useEditorStore((s) => !!popover && !!s.doc?.nodes[popover.nodeId]);
  if (!popover || !exists) return null;
  switch (popover.kind) {
    case 'menu':
      return <ContextMenu key={popover.nodeId} nodeId={popover.nodeId} nodeIds={popover.nodeIds} x={popover.x} y={popover.y} />;
    case 'note':
      return <NotePopover key={popover.nodeId} nodeId={popover.nodeId} />;
    case 'link':
      return <LinkPopover key={popover.nodeId} nodeId={popover.nodeId} />;
    case 'due':
      return <DuePopover key={popover.nodeId} nodeId={popover.nodeId} />;
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

/** Status choices (未着手 / 進行中 / 待ち / 完了) shared by the context menu and the status picker on topics. */
export function StatusOptions({ nodeId, nodeIds = [nodeId], onDone }: { nodeId: NodeId; nodeIds?: NodeId[]; onDone: () => void }) {
  const current = useEditorStore((s) => displayStatus(s.doc!.nodes[nodeId]));
  const choose = (s: DisplayStatus) => {
    const store = useEditorStore.getState();
    if (nodeIds.length > 1) store.bulkSetStatus(s);
    else store.setStatus(nodeId, s);
    onDone();
  };
  return (
    <>
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          role="menuitemradio"
          aria-checked={current === s}
          className="menu-item"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(s)}
        >
          <StatusIcon status={s} size={14} /> {STATUS_LABELS[s]}
          {current === s && <span className="menu-check">✓</span>}
        </button>
      ))}
    </>
  );
}

function ContextMenu({ nodeId, nodeIds = [nodeId], x, y }: { nodeId: NodeId; nodeIds?: NodeId[]; x: number; y: number }) {
  const isRoot = useEditorStore((s) => s.doc!.rootId === nodeId);
  const status = useEditorStore((s) => displayStatus(s.doc!.nodes[nodeId]));
  const routine = useEditorStore((s) => nodeIds.every((id) => !!s.doc!.nodes[id]?.routine));
  const multiple = nodeIds.length > 1;
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

  return (
    <>
      <Backdrop onClose={closePopover} />
      <div ref={ref} className="context-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
        <button role="menuitem" className="menu-item" onClick={() => openPopover({ kind: 'note', nodeId })}>
          <NoteIcon /> メモ
        </button>
        <button role="menuitem" className="menu-item" onClick={() => openPopover({ kind: 'link', nodeId })}>
          <LinkIcon /> リンク
        </button>
        <button role="menuitem" className="menu-item" onClick={() => openPopover({ kind: 'due', nodeId })}>
          <CalendarIcon size={14} /> 期日
        </button>
        {!isRoot && <button role="menuitemcheckbox" aria-checked={routine} className="menu-item" onClick={() => { const store = useEditorStore.getState(); if (multiple) store.bulkSetRoutine(!routine); else store.setAttributes(nodeId, { routine: !routine }); closePopover(); }}>{routine ? '✓ ' : ''}{multiple ? `${nodeIds.length}件に` : ''}ルーティンタスク</button>}
        {!isRoot && (
          <div className="menu-sub" onMouseEnter={() => setSubOpen(true)} onMouseLeave={() => setSubOpen(false)}>
            <button
              role="menuitem"
              className="menu-item"
              aria-haspopup="menu"
              aria-expanded={subOpen}
              onClick={() => setSubOpen(true)}
            >
              <StatusIcon status={status} size={14} /> ステータス <span className="menu-arrow">›</span>
            </button>
            {subOpen && (
              <div className="context-menu submenu" role="menu">
              <StatusOptions nodeId={nodeId} nodeIds={nodeIds} onDone={closePopover} />
              </div>
            )}
          </div>
        )}
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

function PopoverFrame({
  nodeId,
  width,
  title,
  onClose,
  children,
}: {
  nodeId: NodeId;
  width: number;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const style = useAnchor(nodeId, width);
  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="popover" style={style} role="dialog">
        <div className="popover-header">
          {title}
          <button className="popover-close" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * Memo: always editable, saved automatically shortly after typing stops (and when closed).
 * URLs in the memo are listed below as clickable links.
 */
function NotePopover({ nodeId }: { nodeId: NodeId }) {
  const saved = useEditorStore((s) => s.doc!.nodes[nodeId].note ?? '');
  const [draft, setDraft] = useState(saved);
  const draftRef = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = () => {
    clearTimeout(timer.current);
    const text = draftRef.current;
    const note = text.trim() ? text.replace(/\s+$/, '') : undefined;
    useEditorStore.getState().setAttributes(nodeId, { note }, { coalesce: `note:${nodeId}` });
  };

  // Save any pending input when the popup closes.
  useEffect(
    () => () => {
      flush();
      useEditorStore.getState().endCoalesce();
    },
    [],
  );

  const urls = splitUrls(draft).filter((p) => p.type === 'url');

  return (
    <PopoverFrame
      nodeId={nodeId}
      width={420}
      onClose={closePopover}
      title={
        <>
          <NoteIcon /> メモ
        </>
      }
    >
      <textarea
        className="note-editor"
        aria-label="メモ"
        autoFocus
        value={draft}
        placeholder="メモを入力（URLも記載できます）。自動で保存されます。"
        onChange={(e) => {
          setDraft(e.target.value);
          draftRef.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, NOTE_AUTOSAVE_MS);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            closePopover();
          }
        }}
      />
      {urls.length > 0 && (
        <div className="note-links">
          {urls.map((u, i) => (
            <a key={i} href={u.value} target="_blank" rel="noopener noreferrer">
              <LinkIcon size={12} /> {u.value}
            </a>
          ))}
        </div>
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
    <PopoverFrame
      nodeId={nodeId}
      width={420}
      onClose={closePopover}
      title={
        <>
          <LinkIcon /> リンク
        </>
      }
    >
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

/** Due date: pick from the calendar; applied immediately. */
function DuePopover({ nodeId }: { nodeId: NodeId }) {
  const due = useEditorStore((s) => s.doc!.nodes[nodeId].dueDate ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      ref.current?.showPicker();
    } catch {
      /* showPicker needs a user gesture / may be unsupported: the input is still usable */
    }
  }, []);

  const setDue = (dueDate: string | undefined) => useEditorStore.getState().setAttributes(nodeId, { dueDate });

  return (
    <PopoverFrame
      nodeId={nodeId}
      width={300}
      onClose={closePopover}
      title={
        <>
          <CalendarIcon size={14} /> 期日{due && <span className="due-current">（{formatDue(due)}まで）</span>}
        </>
      }
    >
      <input
        ref={ref}
        type="date"
        className="link-input"
        aria-label="期日"
        autoFocus
        value={due}
        onChange={(e) => setDue(e.target.value || undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') closePopover();
        }}
      />
      <div className="popover-actions">
        {due && (
          <button
            className="btn danger-text"
            onClick={() => {
              setDue(undefined);
              closePopover();
            }}
          >
            期日を削除
          </button>
        )}
        <span className="popover-hint" />
        <button className="btn" onClick={closePopover}>
          閉じる
        </button>
      </div>
    </PopoverFrame>
  );
}
