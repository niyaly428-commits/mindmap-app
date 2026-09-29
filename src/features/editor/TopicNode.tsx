import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useEditorStore } from '../../store/editorStore';
import type { TaskStatus } from '../../model/types';
import { useDragStore } from './dragStore';
import { LinkIcon, NoteIcon, STATUS_LABELS, StatusIcon } from './icons';
import { openPopover } from './popoverStore';

export type TopicNodeData = {
  text: string;
  checked: boolean;
  depth: number;
  color: string;
  /** The box grows with its content up to this width; longer text wraps. */
  maxWidth: number;
  status?: TaskStatus;
  hasNote: boolean;
  link?: string;
};

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export type TopicNodeType = Node<TopicNodeData, 'topic'>;

const hidden: CSSProperties = { opacity: 0, pointerEvents: 'none' };

function TopicNodeView({ id, data }: NodeProps<TopicNodeType>) {
  const selected = useEditorStore((s) => s.selectedId === id);
  const editing = useEditorStore((s) => s.editingId === id);
  const isDropTarget = useDragStore((s) => s.dropTargetId === id);
  const isDragging = useDragStore((s) => s.draggingIds.has(id));
  const titleDraft = useEditorStore((s) => (data.depth === 0 ? s.titleDraft : null));
  const { toggleChecked, startEditing, select } = useEditorStore.getState();

  const level = data.depth === 0 ? 'root' : data.depth === 1 ? 'main' : 'sub';
  const className = [
    'topic',
    `topic-${level}`,
    selected && 'is-selected',
    isDropTarget && 'is-drop-target',
    isDragging && 'is-dragging',
    data.checked && 'is-checked',
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
      {data.depth > 0 && (
        <input
          type="checkbox"
          className="topic-check nodrag"
          tabIndex={-1}
          checked={data.checked}
          aria-label="完了"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleChecked(id)}
        />
      )}
      {data.status && (
        <span className="topic-status" title={STATUS_LABELS[data.status]} aria-label={STATUS_LABELS[data.status]}>
          <StatusIcon status={data.status} />
        </span>
      )}
      {editing ? (
        <TopicEditor id={id} initial={data.text} isRoot={data.depth === 0} />
      ) : (
        <span className="topic-text">{titleDraft ?? data.text}</span>
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
            openPopover({ kind: 'note', nodeId: id, mode: 'view' });
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
    </div>
  );
}

function TopicEditor({ id, initial, isRoot }: { id: string; initial: string; isRoot: boolean }) {
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
      className="topic-editor nodrag nopan nowheel"
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
        if (e.key === 'Enter' && !e.shiftKey) {
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
