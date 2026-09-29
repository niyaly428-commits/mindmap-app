export type NodeId = string;

export type Side = 'left' | 'right';

/** Stored "in progress" states. Completion is `MindNode.checked` (shown as the 4th status "完了"). */
export type TaskStatus = 'todo' | 'doing' | 'waiting';

/** What the UI shows: `checked` → 'done', otherwise the stored status (default 'todo'). */
export type DisplayStatus = TaskStatus | 'done';

/** Topic text colors; undefined = default (black / white on filled main topics). */
export type TextColor = 'black' | 'red' | 'blue' | 'orange';

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
  /** Completed ("完了"). Parent/child propagation works on this flag. */
  checked: boolean;
  /** Only meaningful for direct children of the root. */
  side?: Side;
  collapsed?: boolean;
  /** Only meaningful while not checked; cleared when the task is completed. */
  status?: TaskStatus;
  /** Free text; may contain URLs (rendered as links). */
  note?: string;
  /** Normalized http(s) URL. */
  link?: string;
  /** Local date "YYYY-MM-DD". */
  dueDate?: string;
  bold?: boolean;
  textColor?: TextColor;
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
