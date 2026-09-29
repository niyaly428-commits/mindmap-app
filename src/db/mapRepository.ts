import { db as defaultDb, type MindMapDB } from './db';
import { createMap } from '../model/tree';
import type { MindMapDoc, MindMapSummary } from '../model/types';

export function createMapRepository(db: MindMapDB = defaultDb) {
  return {
    async list(): Promise<MindMapSummary[]> {
      const maps = await db.maps.orderBy('updatedAt').reverse().toArray();
      return maps.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
    },
    get: (id: string): Promise<MindMapDoc | undefined> => db.maps.get(id),
    async create(title?: string): Promise<MindMapDoc> {
      const doc = createMap(title);
      await db.maps.add(doc);
      return doc;
    },
    async save(doc: MindMapDoc): Promise<void> {
      await db.maps.put(doc);
    },
    async rename(id: string, title: string): Promise<void> {
      await db.maps.update(id, { title, updatedAt: Date.now() });
    },
    async remove(id: string): Promise<void> {
      await db.maps.delete(id);
    },
  };
}

export type MapRepository = ReturnType<typeof createMapRepository>;

export const mapRepository = createMapRepository();
