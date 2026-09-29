import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useEditorStore } from '../../store/editorStore';
import { dueState, formatDue } from '../../lib/date';
import type { DisplayStatus, TextColor } from '../../model/types';
import { useDragStore } from './dragStore';
import { CalendarIcon, LinkIcon, NoteIcon, STATUS_LABELS, StatusIcon, TEXT_COLORS } from './icons';
import { openPopover } from './popoverStore';
import { StatusOptions } from './Popovers';
import { mapRepository } from '../../db/mapRepository';

export type TopicNodeData = {
  text: string;
  depth: number;
  color: string;
  /** The box grows with its content up to this width; longer text wraps. */
  maxWidth: number;
  status: DisplayStatus;
  hasNote: boolean;
  link?: string;
  dueDate?: string;
  bold?: boolean;
  textColor?: TextColor;
  routine?: boolean;
  images?: string[];
};

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export type TopicNodeType = Node<TopicNodeData, 'topic'>;

const hidden: CSSProperties = { opacity: 0, pointerEvents: 'none' };

function TopicNodeView({ id, data }: NodeProps<TopicNodeType>) {
  const selected = useEditorStore((s) => s.selectedId === id);
  const editing = useEditorStore((s) => s.editingId === id);
  const isDropTarget = useDragStore((s) => s.dropTargetId === id);
  const isDragging = useDragStore((s) => s.draggingIds.has(id));
  const selectedMany = useEditorStore((s) => s.selectedIds.includes(id));
  const titleDraft = useEditorStore((s) => (data.depth === 0 ? s.titleDraft : null));
  const { startEditing, select } = useEditorStore.getState();
  const [imageUrls, setImageUrls] = useState<{ id: string; url: string }[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const urls: { id: string; url: string }[] = [];
    Promise.all((data.images ?? []).map(async (assetId) => {
      const blob = await mapRepository.getImage(assetId);
      if (blob) urls.push({ id: assetId, url: URL.createObjectURL(blob) });
    })).then(() => { if (active) setImageUrls(urls); else urls.forEach((x) => URL.revokeObjectURL(x.url)); });
    return () => { active = false; urls.forEach((x) => URL.revokeObjectURL(x.url)); };
  // Track serialized asset IDs, not the transient URL array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(data.images ?? []).join('|')]);
  useEffect(() => { if (!preview) return; const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [preview]);

  const level = data.depth === 0 ? 'root' : data.depth === 1 ? 'main' : 'sub';
  const className = [
    'topic',
    `topic-${level}`,
    selected && 'is-selected',
    isDropTarget && 'is-drop-target',
    isDragging && 'is-dragging',
    data.status === 'done' && 'is-checked',
    data.dueDate && `has-due due-${dueState(data.dueDate)}`,
    data.routine && 'is-routine',
    selectedMany && 'is-multi-selected',
  ]
    .filter(Boolean)
    .join(' ');

  const textClass = [
    'topic-text',
    data.bold && 'is-bold',
    data.textColor && data.textColor !== 'black' && `text-${data.textColor}`,
    data.textColor && 'has-color',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={{ '--branch': data.color, maxWidth: data.maxWidth } as CSSProperties}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing(id);
      }}
    >
      <Handle type="source" position={Position.Right} id="sr" style={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Left} id="sl" style={hidden} isConnectable={false} />
      <Handle type="target" position={Position.Left} id="tl" style={hidden} isConnectable={false} />
      <Handle type="target" position={Position.Right} id="tr" style={hidden} isConnectable={false} />
      {data.depth > 0 && <StatusControl id={id} status={data.status} />}
      {data.routine && <span className="routine-mark" title="Routine">↻</span>}
      {editing ? (
        <>
          <EditToolbar id={id} bold={!!data.bold} textColor={data.textColor} />
          <TopicEditor id={id} initial={data.text} isRoot={data.depth === 0} className={textClass} />
        </>
      ) : (
        <span className={textClass}>{titleDraft ?? data.text}</span>
      )}
      {data.dueDate && (
        <button
          className="topic-due nodrag"
          title={`期日: ${data.dueDate}`}
          aria-label={`期日 ${formatDue(data.dueDate)}`}
          tabIndex={-1}
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={(e) => {
            e.stopPropagation();
            select(id);
            openPopover({ kind: 'due', nodeId: id });
          }}
        >
          <CalendarIcon />
          {formatDue(data.dueDate)}
        </button>
      )}
      {data.hasNote && (
        <button
          className="topic-icon nodrag"
          title="メモを表示"
          aria-label="メモを表示"
          tabIndex={-1}
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={(e) => {
            e.stopPropagation();
            select(id);
            openPopover({ kind: 'note', nodeId: id });
          }}
        >
          <NoteIcon />
        </button>
      )}
      {data.link && (
        <a
          className="topic-icon nodrag"
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          title={data.link}
          aria-label="リンクを開く"
          tabIndex={-1}
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={stop}
        >
          <LinkIcon />
        </a>
      )}
      {imageUrls.length > 0 && <div className="topic-images">{imageUrls.map((image) => <span key={image.id}><button aria-label="画像を拡大" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setPreview(image.url); }}><img src={image.url} /></button><button className="image-remove" aria-label="画像を削除" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); useEditorStore.getState().setAttributes(id, { images: (data.images ?? []).filter((assetId) => assetId !== image.id) }); }}>×</button></span>)}</div>}
      {preview && <div className="image-lightbox" role="dialog" onClick={() => setPreview(null)}><button className="lightbox-close" onClick={() => setPreview(null)}>×</button><img src={preview} /></div>}
    </div>
  );
}

const HOVER_OPEN_MS = 300;
const HOVER_CLOSE_MS = 200;

/** Status icon (also the completion checkbox). Hover or click shows the 4 statuses to choose from. */
function StatusControl({ id, status }: { id: string; status: DisplayStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const schedule = (next: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.status-picker') && !ref.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const rect = open ? ref.current?.getBoundingClientRect() : undefined;

  return (
    <>
      <button
        ref={ref}
        role="checkbox"
        aria-checked={status === 'done'}
        aria-label={`ステータス: ${STATUS_LABELS[status]}`}
        title={STATUS_LABELS[status]}
        className="topic-status nodrag"
        tabIndex={-1}
        onPointerDown={stop}
        onDoubleClick={stop}
        onMouseEnter={() => {
          if (useDragStore.getState().draggingIds.size === 0) schedule(true, HOVER_OPEN_MS);
        }}
        onMouseLeave={() => schedule(false, HOVER_CLOSE_MS)}
        onClick={(e) => {
          e.stopPropagation();
          clearTimeout(timer.current);
          const { select, toggleChecked } = useEditorStore.getState();
          select(id);
          toggleChecked(id);
          setOpen(false);
        }}
      >
        <StatusIcon status={status} />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            className="context-menu status-picker"
            role="menu"
            aria-label="ステータスを選択"
            style={{ left: rect.left, top: rect.bottom + 4 }}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={() => schedule(false, HOVER_CLOSE_MS)}
          >
            <StatusOptions nodeId={id} onDone={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Mini toolbar shown above a topic while editing its text: bold + 4 text colors. */
function EditToolbar({ id, bold, textColor }: { id: string; bold: boolean; textColor?: TextColor }) {
  const { toggleBold, setAttributes } = useEditorStore.getState();
  const keepFocus = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="edit-toolbar nodrag" onPointerDown={keepFocus} onMouseDown={keepFocus} onDoubleClick={stop}>
      <TextStyleButtons
        bold={bold}
        textColor={textColor}
        onBold={() => toggleBold(id)}
        onColor={(c) => setAttributes(id, { textColor: c })}
      />
    </div>
  );
}

export function TextStyleButtons({
  bold,
  textColor,
  disabled,
  onBold,
  onColor,
}: {
  bold: boolean;
  textColor?: TextColor;
  disabled?: boolean;
  onBold: () => void;
  onColor: (c: TextColor) => void;
}) {
  const current = textColor ?? 'black';
  return (
    <>
      <button
        className={`style-btn bold-btn${bold ? ' is-active' : ''}`}
        aria-label="太字 (Ctrl+B)"
        aria-pressed={bold}
        title="太字 (Ctrl+B)"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onBold}
      >
        B
      </button>
      {TEXT_COLORS.map((c) => (
        <button
          key={c.value}
          className={`style-btn color-btn${current === c.value && !disabled ? ' is-active' : ''}`}
          aria-label={`文字色: ${c.label}`}
          aria-pressed={current === c.value}
          title={`文字色: ${c.label}`}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onColor(c.value)}
        >
          <span className="color-dot" style={{ background: c.css }} />
        </button>
      ))}
    </>
  );
}

function TopicEditor({ id, initial, isRoot, className }: { id: string; initial: string; isRoot: boolean; className: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  // New nodes stay `visibility: hidden` until React Flow measures them, so retry focusing for a few frames.
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      el.select();
      if (document.activeElement !== el && tries++ < 30) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const { setText, stopEditing, setTitleDraft } = useEditorStore.getState();
    const text = value.trim();
    if (save && text) setText(id, text);
    if (isRoot) setTitleDraft(null);
    stopEditing();
  };

  return (
    <textarea
      ref={ref}
      className={`topic-editor ${className} nodrag nopan nowheel`}
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      onChange={(e) => {
        setValue(e.target.value);
        // The root topic and the map title are the same; mirror typing into the toolbar title.
        if (isRoot) useEditorStore.getState().setTitleDraft(e.target.value);
      }}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          useEditorStore.getState().toggleBold(id);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(true);
          useEditorStore.getState().addChild(id);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
    />
  );
}

export const TopicNode = memo(TopicNodeView);
