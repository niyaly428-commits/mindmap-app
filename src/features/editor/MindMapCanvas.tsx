import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
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
import { publishCurrentLayout } from './pdfExport';

const nodeTypes = { topic: TopicNode };
const edgeTypes = { structured: StructuredEdge };

function StructuredEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerStart, markerEnd, interactionWidth }: EdgeProps<Edge>) {
  const direction = targetX >= sourceX ? 1 : -1;
  const routeIndex = Number(data?.routeIndex ?? 0);
  const routeCount = Number(data?.routeCount ?? 1);
  const busX = sourceX + direction * 28;
  const firstY = Number(data?.firstY ?? targetY);
  const lastY = Number(data?.lastY ?? targetY);
  const path = routeCount < 2
    ? `M ${sourceX},${sourceY} H ${busX} V ${targetY} H ${targetX}`
    : routeIndex === 0
      ? `M ${sourceX},${sourceY} H ${busX} V ${firstY} V ${lastY} M ${busX},${targetY} H ${targetX}`
      : `M ${busX},${targetY} H ${targetX}`;
  return <g data-route-parent-id={String(data?.routeParentId ?? '')}><BaseEdge id={id} path={path} style={style} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={interactionWidth} /></g>;
}

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
        branch: box.branch,
        images: node.images,
      },
      });
      if (node.parentId) {
        const parentBox = boxes.get(node.parentId)!;
        const right = box.x + box.width / 2 >= parentBox.x + parentBox.width / 2;
        const siblings = doc.nodes[node.parentId].children.filter((siblingId) => {
          const sibling = boxes.get(siblingId);
          return sibling && (sibling.x + sibling.width / 2 >= parentBox.x + parentBox.width / 2) === right;
        });
        const sourceIndex = siblings.indexOf(node.id);
        const siblingCenters = siblings.map((siblingId) => { const sibling = boxes.get(siblingId)!; return sibling.y + sibling.height / 2; });
        edges.push({
        id: `e-${box.id}`,
        source: node.parentId,
        target: box.id,
          sourceHandle: right ? 'sr' : 'sl',
        targetHandle: right ? 'tl' : 'tr',
          type: doc.designPreset === 'soft-organic' || !doc.designPreset ? 'default' : 'structured',
          data: { routeIndex: sourceIndex, routeCount: siblings.length, firstY: Math.min(...siblingCenters), lastY: Math.max(...siblingCenters), routeParentId: node.parentId },
        focusable: false,
        selectable: false,
        style: { stroke: color, strokeWidth: doc.designPreset === 'soft-organic' ? (box.depth === 1 ? 2.5 : 1.8) : doc.designPreset === 'clean-structured' ? 1.6 : 1.2 },
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
  const boxes = useMemo(() => layoutMap(doc, defaultMeasurer, sizes, doc.designPreset), [doc, sizes]);
  const flow = useMemo(() => toFlow(doc, boxes, sizes), [doc, boxes, sizes]);
  const [nodes, setNodes] = useState(flow.nodes);
  const drag = useRef<{ ids: Set<NodeId> } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => { publishCurrentLayout(doc.id, Array.from(boxes.values())); }, [doc.id, boxes]);

  useEffect(() => {
    const root = document.querySelector('.react-flow');
    if (!root) return;
    let start: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      if (event.button !== 0 || !target.closest('.react-flow__pane') || target.closest('.react-flow__node')) return;
      start = { x: event.clientX, y: event.clientY };
      event.preventDefault(); event.stopPropagation();
      // Capture only gestures that began on blank canvas; node drags remain owned by React Flow.
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
      const { moveNode, setPositions, select } = useEditorStore.getState();
      const origin = boxes.get(node.id)!;
      const dx = node.position.x - origin.x;
      const dy = node.position.y - origin.y;
      if (target) {
        const parent = boxes.get(target)!;
        const targetLeft = target === doc.rootId ? side === 'left' : parent.side === 'left';
        const gap = target === doc.rootId
          ? doc.designPreset === 'soft-organic' || !doc.designPreset ? 84 : doc.designPreset === 'clean-structured' ? 62 : 66
          : 48;
        const placedX = targetLeft ? parent.x - gap - origin.width : parent.x + parent.width + gap;
        const translateX = placedX - node.position.x;
        const positions: Record<NodeId, XYPosition> = {};
        for (const id of ids) {
          const box = boxes.get(id);
          if (box) positions[id] = { x: box.x + dx + translateX, y: box.y + dy };
        }
        moveNode(node.id, target, targetLeft ? 'left' : 'right', positions);
      } else {
        const positions: Record<NodeId, XYPosition> = {};
        for (const id of ids) { const b = boxes.get(id); if (b) positions[id] = { x: b.x + dx, y: b.y + dy }; }
        const parentId = doc.nodes[node.id].parentId;
        const parent = parentId ? boxes.get(parentId) : undefined;
        const nodeSide = parent && node.position.x + origin.width / 2 < parent.x + parent.width / 2 ? 'left' : 'right';
        setPositions(positions, parentId ? { id: node.id, side: nodeSide } : undefined);
      }
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
      edgeTypes={edgeTypes}
      onNodeDoubleClick={(_, node) => useEditorStore.getState().startEditing(node.id)}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => useEditorStore.getState().select(n.id)}
      onNodeContextMenu={(e, n) => {
        e.preventDefault();
        const store = useEditorStore.getState();
        const ids = store.selectedIds.includes(n.id) ? store.selectedIds : [n.id];
        if (ids.length === 1 && store.selectedIds[0] !== n.id) store.select(n.id);
        openPopover({ kind: 'menu', nodeId: n.id, nodeIds: ids, x: e.clientX, y: e.clientY });
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
      panOnScroll
      panOnScrollMode={PanOnScrollMode.Vertical}
      zoomOnScroll
      zoomActivationKeyCode="Control"
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
    >
      <Background variant={BackgroundVariant.Dots} gap={doc.designPreset === 'soft-analytical' ? 20 : 24} size={1} color={doc.designPreset === 'soft-organic' ? '#ded9cf' : doc.designPreset === 'clean-structured' ? '#d8e0ea' : '#dfe4ef'} />
      <Controls showInteractive={false} />
    </ReactFlow>
    {selectionRect && <div className="selection-rectangle" style={{ left: selectionRect.left, top: selectionRect.top, width: selectionRect.width, height: selectionRect.height }} />}
    </>
  );
}
