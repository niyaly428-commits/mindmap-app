import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useEditorStore } from '../../store/editorStore';
import { useDragStore } from './dragStore';

export type TopicNodeData = {
  text: string;
  checked: boolean;
  depth: number;
  color: string;
  width: number;
};

export type TopicNodeType = Node<TopicNodeData, 'topic'>;

const hidden: CSSProperties = { opacity: 0, pointerEvents: 'none' };

function TopicNodeView({ id, data }: NodeProps<TopicNodeType>) {
  const selected = useEditorStore((s) => s.selectedId === id);
  const editing = useEditorStore((s) => s.editingId === id);
  const isDropTarget = useDragStore((s) => s.dropTargetId === id);
  const isDragging = useDragStore((s) => s.draggingIds.has(id));
  const { toggleChecked, startEditing } = useEditorStore.getState();

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
      style={{ '--branch': data.color, width: data.width } as CSSProperties}
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
      {editing ? <TopicEditor id={id} initial={data.text} /> : <span className="topic-text">{data.text}</span>}
    </div>
  );
}

function TopicEditor({ id, initial }: { id: string; initial: string }) {
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
    const { setText, stopEditing } = useEditorStore.getState();
    const text = value.trim();
    if (save && text) setText(id, text);
    stopEditing();
  };

  return (
    <textarea
      ref={ref}
      className="topic-editor nodrag nopan nowheel"
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      onChange={(e) => setValue(e.target.value)}
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
