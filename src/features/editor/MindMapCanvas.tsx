import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type Edge,
  type OnNodeDrag,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react';
import { useEditorStore } from '../../store/editorStore';
import { descendantIds, displayStatus } from '../../model/tree';
import { defaultMeasurer, iconCount, layoutMap, maxNodeWidth, type NodeBox, type Size } from '../../model/layout';
import type { MindMapDoc, NodeId } from '../../model/types';
import { TopicNode, type TopicNodeType } from './TopicNode';
import { useDragStore } from './dragStore';
import { openPopover } from './popoverStore';
import { branchColor } from './theme';

const nodeTypes = { topic: TopicNode };

function toFlow(
  doc: MindMapDoc,
  boxes: Map<NodeId, NodeBox>,
  sizes: ReadonlyMap<NodeId, Size>,
): { nodes: TopicNodeType[]; edges: Edge[] } {
  const nodes: TopicNodeType[] = [];
  const edges: Edge[] = [];
  for (const box of boxes.values()) {
    const node = doc.nodes[box.id];
    const color = branchColor(box.branch, doc.colorTheme);
    nodes.push({
      id: box.id,
      type: 'topic',
      position: { x: box.x, y: box.y },
      draggable: box.depth > 0,
      // Keep known sizes so React Flow doesn't hide & re-measure every node after each edit.
      measured: sizes.get(box.id),
      data: {
        text: node.text,
        depth: box.depth,
        color,
        maxWidth: maxNodeWidth(box.depth, iconCount(node)),
        status: displayStatus(node),
        hasNote: !!node.note,
        link: node.link,
        dueDate: node.dueDate,
        bold: node.bold,
        textColor: node.textColor,
        routine: node.routine,
        images: node.images,
      },
    });
    if (node.parentId) {
      const right = box.side === 'right';
      edges.push({
        id: `e-${box.id}`,
        source: node.parentId,
        target: box.id,
        sourceHandle: right ? 'sr' : 'sl',
        targetHandle: right ? 'tl' : 'tr',
        type: 'default',
        focusable: false,
        selectable: false,
        style: { stroke: color, strokeWidth: box.depth === 1 ? 3 : 2 },
      });
    }
  }
  return { nodes, edges };
}

const pointOf = (e: MouseEvent | TouchEvent): XYPosition => {
  const p = 'changedTouches' in e ? e.changedTouches[0] : e;
  return { x: p.clientX, y: p.clientY };
};

function hitTest(boxes: Map<NodeId, NodeBox>, p: XYPosition, exclude: Set<NodeId>): NodeId | null {
  for (const b of boxes.values()) {
    if (!exclude.has(b.id) && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return b.id;
  }
  return null;
}

export function MindMapCanvas({ doc }: { doc: MindMapDoc }) {
  const { screenToFlowPosition } = useReactFlow();
  // Real rendered sizes reported by React Flow; the layout uses them so topics never overlap.
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(() => new Map());
  const boxes = useMemo(() => layoutMap(doc, defaultMeasurer, sizes), [doc, sizes]);
  const flow = useMemo(() => toFlow(doc, boxes, sizes), [doc, boxes, sizes]);
  const [nodes, setNodes] = useState(flow.nodes);
  const drag = useRef<{ ids: Set<NodeId> } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const root = document.querySelector('.react-flow');
    if (!root) return;
    let start: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      if (event.button !== 0 || !target.closest('.react-flow__pane') || target.closest('.react-flow__node')) return;
      start = { x: event.clientX, y: event.clientY };
      event.preventDefault(); event.stopPropagation();
      (root as HTMLElement).setPointerCapture?.(event.pointerId);
      setSelectionRect({ left: start.x, top: start.y, width: 0, height: 0 });
    };
    const move = (event: PointerEvent) => {
      if (!start) return;
      event.preventDefault();
      setSelectionRect({ left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY), width: Math.abs(start.x-event.clientX), height: Math.abs(start.y-event.clientY) });
    };
    const up = (event: PointerEvent) => {
      if (!start) return;
      const rect = { left: Math.min(start.x, event.clientX), right: Math.max(start.x, event.clientX), top: Math.min(start.y, event.clientY), bottom: Math.max(start.y, event.clientY) };
      if (Math.abs(start.x-event.clientX) > 5 || Math.abs(start.y-event.clientY) > 5) {
        const ids = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')).filter((el) => {
          const r = el.getBoundingClientRect(); return r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
        }).map((el) => el.dataset.id!).filter((id) => id !== doc.rootId);
        useEditorStore.getState().setSelection(ids);
      }
      start = null; setSelectionRect(null);
    };
    root.addEventListener('pointerdown', down as EventListener, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    return () => { root.removeEventListener('pointerdown', down as EventListener, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
  }, [doc.rootId]);

  useEffect(() => setNodes(flow.nodes), [flow.nodes]);

  const onNodesChange: OnNodesChange<TopicNodeType> = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    setSizes((prev) => {
      let next: Map<NodeId, Size> | null = null;
      for (const c of changes) {
        if (c.type !== 'dimensions' || !c.dimensions) continue;
        const old = prev.get(c.id);
        const { width, height } = c.dimensions;
        if (old && Math.abs(old.width - width) < 0.5 && Math.abs(old.height - height) < 0.5) continue;
        (next ??= new Map(prev)).set(c.id, { width, height });
      }
      return next ?? prev;
    });
  }, []);

  const onNodeDragStart: OnNodeDrag<TopicNodeType> = useCallback(
    (_, node) => {
      const ids = new Set([node.id, ...descendantIds(doc.nodes, node.id)]);
      drag.current = { ids };
      useDragStore.setState({ draggingIds: ids, dropTargetId: null });
    },
    [doc],
  );

  const onNodeDrag: OnNodeDrag<TopicNodeType> = useCallback(
    (event, node) => {
      if (!drag.current) return;
      const { ids } = drag.current;
      const origin = boxes.get(node.id)!;
      const dx = node.position.x - origin.x;
      const dy = node.position.y - origin.y;
      setNodes((nds) =>
        nds.map((n) => {
          const b = boxes.get(n.id);
          return ids.has(n.id) && n.id !== node.id && b ? { ...n, position: { x: b.x + dx, y: b.y + dy } } : n;
        }),
      );
      const p = screenToFlowPosition(pointOf(event));
      const target = hitTest(boxes, p, ids);
      if (useDragStore.getState().dropTargetId !== target) useDragStore.setState({ dropTargetId: target });
    },
    [boxes, screenToFlowPosition],
  );

  const onNodeDragStop: OnNodeDrag<TopicNodeType> = useCallback(
    (event, node) => {
      const ids = drag.current?.ids ?? new Set([node.id]);
      drag.current = null;
      useDragStore.setState({ draggingIds: new Set(), dropTargetId: null });
      setNodes(flow.nodes);

      const p = screenToFlowPosition(pointOf(event));
      const side = p.x < 0 ? 'left' : 'right';
      const target = hitTest(boxes, p, ids);
      const { moveNode, setSide, select } = useEditorStore.getState();
      if (target) moveNode(node.id, target, side);
      else if (doc.nodes[node.id].parentId === doc.rootId) setSide(node.id, side);
      select(node.id);
    },
    [boxes, doc, flow.nodes, screenToFlowPosition],
  );

  return (
    <>
    <ReactFlow
      nodes={nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      onNodeDoubleClick={(_, node) => useEditorStore.getState().startEditing(node.id)}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => useEditorStore.getState().select(n.id)}
      onNodeContextMenu={(e, n) => {
        e.preventDefault();
        useEditorStore.getState().select(n.id);
        openPopover({ kind: 'menu', nodeId: n.id, x: e.clientX, y: e.clientY });
      }}
      onPaneClick={() => useEditorStore.getState().select(null)}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodesConnectable={false}
      elementsSelectable={false}
      nodeDragThreshold={4}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panActivationKeyCode={null}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d6d3c8" />
      <Controls showInteractive={false} />
    </ReactFlow>
    {selectionRect && <div className="selection-rectangle" style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }} />}
    </>
  );
}
