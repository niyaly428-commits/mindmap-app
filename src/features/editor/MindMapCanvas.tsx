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
import { descendantIds } from '../../model/tree';
import { layoutMap, type NodeBox } from '../../model/layout';
import type { MindMapDoc, NodeId } from '../../model/types';
import { TopicNode, type TopicNodeType } from './TopicNode';
import { useDragStore } from './dragStore';
import { branchColor } from './theme';

const nodeTypes = { topic: TopicNode };

function toFlow(doc: MindMapDoc, boxes: Map<NodeId, NodeBox>): { nodes: TopicNodeType[]; edges: Edge[] } {
  const nodes: TopicNodeType[] = [];
  const edges: Edge[] = [];
  for (const box of boxes.values()) {
    const node = doc.nodes[box.id];
    const color = branchColor(box.branch);
    nodes.push({
      id: box.id,
      type: 'topic',
      position: { x: box.x, y: box.y },
      draggable: box.depth > 0,
      data: { text: node.text, checked: node.checked, depth: box.depth, color, width: box.width },
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
  const boxes = useMemo(() => layoutMap(doc), [doc]);
  const flow = useMemo(() => toFlow(doc, boxes), [doc, boxes]);
  const [nodes, setNodes] = useState(flow.nodes);
  const drag = useRef<{ ids: Set<NodeId> } | null>(null);

  useEffect(() => setNodes(flow.nodes), [flow.nodes]);

  const onNodesChange: OnNodesChange<TopicNodeType> = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

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
    <ReactFlow
      nodes={nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => useEditorStore.getState().select(n.id)}
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
  );
}
