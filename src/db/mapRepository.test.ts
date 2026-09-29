import { afterEach, describe, expect, it } from 'vitest';
import { MindMapDB } from './db';
import { createMapRepository } from './mapRepository';
import { addChild } from '../model/tree';

let db: MindMapDB;
const repo = () => createMapRepository(db);

describe('mapRepository (IndexedDB)', () => {
  afterEach(async () => {
    await db.delete();
  });

  it('creates, lists (newest first), saves, renames and removes maps', async () => {
    db = new MindMapDB(`test-${Math.random()}`);
    const r = repo();
    const m1 = await r.create('one');
    await new Promise((res) => setTimeout(res, 5));
    const m2 = await r.create('two');
    expect((await r.list()).map((m) => m.title)).toEqual(['two', 'one']);

    const edited = { ...addChild(m1, m1.rootId, 'child').doc, updatedAt: Date.now() + 1000 };
    await r.save(edited);
    const loaded = await r.get(m1.id);
    expect(Object.keys(loaded!.nodes)).toHaveLength(2);
    expect((await r.list())[0].id).toBe(m1.id);

    await r.rename(m2.id, 'renamed');
    const renamed = (await r.get(m2.id))!;
    expect(renamed.title).toBe('renamed');
    expect(renamed.nodes[renamed.rootId].text).toBe('renamed');

    await r.remove(m1.id);
    expect(await r.get(m1.id)).toBeUndefined();
    expect(await r.list()).toHaveLength(1);
  });

  it('creates the next day map as a new record and keeps the source unchanged', async () => {
    db = new MindMapDB(`test-${Math.random()}`);
    const r = repo();
    const src = await r.create('タスク_9月29日');
    await r.save(addChild(src, src.rootId, '外注').doc);
    const before = await db.maps.get(src.id);

    const next = (await r.createNextDay(src.id))!;
    expect(next.title).toBe('タスク_9月30日');
    expect(await db.maps.get(src.id)).toEqual(before);
    const stored = (await r.get(next.id))!;
    expect(stored.nodes[stored.rootId].children.map((id) => stored.nodes[id].text)).toEqual(['外注']);
    expect(await r.list()).toHaveLength(2);
  });

  it('persists image blobs and clones them into the next map', async () => {
    db = new MindMapDB(`test-${Math.random()}`);
    const r = repo(); const map = await r.create('Images');
    const added = addChild(map, map.rootId, 'Photo');
    const assetId = await r.addImage(map.id, new Blob(['pixels'], { type: 'image/png' }));
    added.doc.nodes[added.id].images = [assetId]; await r.save(added.doc);
    expect(await (await r.getImage(assetId))!.text()).toBe('pixels');
    const next = await r.createNextDay(map.id);
    const copiedId = next!.nodes[next!.rootId].children[0];
    const copiedAssetId = next!.nodes[copiedId].images![0];
    expect(copiedAssetId).not.toBe(assetId);
    expect(await (await r.getImage(copiedAssetId))!.text()).toBe('pixels');
    await r.remove(map.id);
    expect(await r.getImage(assetId)).toBeUndefined();
    expect(await r.getImage(copiedAssetId)).toBeDefined();
  });
});
