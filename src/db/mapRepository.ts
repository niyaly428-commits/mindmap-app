import { db as defaultDb, type MindMapDB } from './db';
import { createMap, setTitle, syncRootWithTitle } from '../model/tree';
import { createNextDayMap, nextDayTitle } from '../model/nextDay';
import { createId } from '../model/tree';
import type { MindMapDoc, MindMapSummary } from '../model/types';
import { addDaysToDateKey, dailyMapTitle, dateKeyToLocalDate, mapDateOf, sortTimelineMaps } from '../model/timeline';

function notifyLocalChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('mindmap:local-change'));
}

export function createMapRepository(db: MindMapDB = defaultDb) {
  return {
    async list(): Promise<MindMapSummary[]> {
      const maps = await db.maps.orderBy('updatedAt').reverse().toArray();
      return sortTimelineMaps(maps.map((doc) => ({ id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt, mapDate: mapDateOf(doc) })));
    },
    async get(id: string): Promise<MindMapDoc | undefined> {
      const doc = await db.maps.get(id);
      return doc && syncRootWithTitle(doc);
    },
    async create(title?: string): Promise<MindMapDoc> {
      const doc = createMap(title);
      await db.maps.add(doc);
      notifyLocalChange();
      return doc;
    },
    /** Returns the existing day's map, or creates one with an explicit local calendar date. */
    async createForDate(mapDate: string): Promise<MindMapDoc> {
      let created = false;
      const doc = await db.transaction('rw', db.maps, async () => {
        const existing = (await db.maps.toArray())
          .filter((candidate) => mapDateOf(candidate) === mapDate)
          .sort((a, b) => Number(b.mapDate === mapDate) - Number(a.mapDate === mapDate) || a.createdAt - b.createdAt)[0];
        if (existing) return existing;
        const next = { ...createMap(dailyMapTitle(mapDate)), mapDate };
        await db.maps.add(next);
        created = true;
        return next;
      });
      if (created) notifyLocalChange();
      return doc;
    },
    /** Creates the next day's map from `id` (the source map is left untouched). */
    async createNextDay(id: string): Promise<MindMapDoc | undefined> {
      return db.transaction('rw', db.maps, db.assets, async () => {
        const source = await db.maps.get(id);
        if (!source) return undefined;
        const sourceDate = mapDateOf(source);
        const targetDate = addDaysToDateKey(sourceDate, 1);
        const existing = (await db.maps.toArray())
          .filter((candidate) => mapDateOf(candidate) === targetDate)
          .sort((a, b) => Number(b.mapDate === targetDate) - Number(a.mapDate === targetDate) || a.createdAt - b.createdAt)[0];
        if (existing) return existing;
        const generated = createNextDayMap(source);
        const doc = {
          ...setTitle(generated, nextDayTitle(source.title, dateKeyToLocalDate(sourceDate))),
          mapDate: targetDate,
        };
        for (const node of Object.values(doc.nodes)) {
          if (!node.images?.length) continue;
          const copied: string[] = [];
          for (const assetId of node.images) {
            const asset = await db.assets.get(assetId);
            if (!asset) continue;
            const nextId = createId();
            await db.assets.add({ ...asset, id: nextId, mapId: doc.id });
            copied.push(nextId);
          }
          node.images = copied;
        }
        await db.maps.add(doc);
        notifyLocalChange();
        return doc;
      });
    },
    async save(doc: MindMapDoc): Promise<void> {
      const current = await db.maps.get(doc.id);
      await db.maps.put({
        ...doc,
        updatedAt: Math.max(doc.updatedAt, current?.updatedAt ?? 0),
        mapDate: doc.mapDate ?? current?.mapDate,
        dailyReport: doc.dailyReport ?? current?.dailyReport,
      });
      notifyLocalChange();
    },
    async saveDailyReport(mapId: string, dailyReport: string): Promise<void> {
      await db.transaction('rw', db.maps, async () => {
        const current = await db.maps.get(mapId);
        if (current) await db.maps.put({ ...current, dailyReport, updatedAt: Date.now() });
      });
      notifyLocalChange();
    },
    async rename(id: string, title: string): Promise<void> {
      await db.transaction('rw', db.maps, async () => {
        const doc = await db.maps.get(id);
        if (doc) await db.maps.put({ ...setTitle(doc, title), updatedAt: Date.now() });
      });
      notifyLocalChange();
    },
    async remove(id: string): Promise<void> {
      await db.transaction('rw', db.maps, db.assets, db.syncTombstones, async () => {
        await db.syncTombstones.put({ mapId: id, deletedAt: Date.now() });
        await db.assets.where('mapId').equals(id).delete();
        await db.maps.delete(id);
      });
      notifyLocalChange();
    },
    async addImage(mapId: string, blob: Blob): Promise<string> {
      const id = createId();
      await db.assets.add({ id, mapId, blob, type: blob.type, createdAt: Date.now() });
      notifyLocalChange();
      return id;
    },
    async getImage(id: string): Promise<Blob | undefined> { return (await db.assets.get(id))?.blob; },
    async removeImage(id: string): Promise<void> { await db.assets.delete(id); },
  };
}

export type MapRepository = ReturnType<typeof createMapRepository>;

export const mapRepository = createMapRepository();
