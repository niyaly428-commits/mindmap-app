export type NodeId = string;

export type Side = 'left' | 'right';

/**
 * A single topic in the mind map.
 * Optional fields are reserved for future features (memo, due date, priority, tags, images, folding)
 * so they can be added without a storage migration.
 */
export interface MindNode {
  id: NodeId;
  text: string;
  parentId: NodeId | null;
  children: NodeId[];
  checked: boolean;
  /** Only meaningful for direct children of the root. */
  side?: Side;
  collapsed?: boolean;
  note?: string;
  dueDate?: string;
  priority?: 1 | 2 | 3;
  tags?: string[];
  /** Reference to a Blob stored in the `assets` table (future). */
  image?: { assetId: string; width: number; height: number };
}

export interface MindMapDoc {
  id: string;
  schemaVersion: 1;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, MindNode>;
  createdAt: number;
  updatedAt: number;
}

export interface MindMapSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
