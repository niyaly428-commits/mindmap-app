import Dexie, { type EntityTable } from 'dexie';
import type { MindMapDoc } from '../model/types';

export interface MapAsset { id: string; mapId: string; blob: Blob; type: string; createdAt: number }

/**
 * Local database (IndexedDB via Dexie).
 *
 * - `maps`: one record per mind map (whole document; small JSON).
 * - Future: add an `assets` table for image Blobs in a new version, e.g.
 *   `this.version(2).stores({ maps: 'id, updatedAt', assets: 'id, mapId' })`
 *   and reference them from `MindNode.image.assetId`.
 */
export class MindMapDB extends Dexie {
  maps!: EntityTable<MindMapDoc, 'id'>;
  assets!: EntityTable<MapAsset, 'id'>;

  constructor(name = 'mindmap-app') {
    super(name);
    this.version(1).stores({ maps: 'id, updatedAt' });
    this.version(2).stores({ maps: 'id, updatedAt', assets: 'id, mapId' });
  }
}

export const db = new MindMapDB();

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
