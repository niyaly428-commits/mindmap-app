import { describe, expect, it } from 'vitest';
import { layoutMap, type NodeBox } from './layout';
import { addChild, createMap } from './tree';

const measure = (text: string) => text.length * 10;

const overlaps = (a: NodeBox, b: NodeBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('layoutMap', () => {
  it('centers the root and places main topics on both sides', () => {
    let doc = createMap();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = addChild(doc, doc.rootId, `topic ${i}`);
      doc = r.doc;
      ids.push(r.id);
    }
    const boxes = layoutMap(doc, measure);
    const root = boxes.get(doc.rootId)!;
    expect(root.x + root.width / 2).toBeCloseTo(0);
    expect(root.y + root.height / 2).toBeCloseTo(0);
    for (const id of ids) {
      const b = boxes.get(id)!;
      if (doc.nodes[id].side === 'left') expect(b.x + b.width).toBeLessThan(root.x);
      else expect(b.x).toBeGreaterThan(root.x + root.width);
    }
  });

  it('places children further out than parents and without overlaps', () => {
    let doc = createMap();
    const main = addChild(doc, doc.rootId, 'main');
    doc = main.doc;
    for (let i = 0; i < 5; i++) {
      const r = addChild(doc, main.id, `sub ${i}`);
      doc = r.doc;
      for (let j = 0; j < 3; j++) doc = addChild(doc, r.id, `leaf ${i}-${j}`).doc;
    }
    const boxes = [...layoutMap(doc, measure).values()];
    expect(boxes).toHaveLength(Object.keys(doc.nodes).length);
    for (const b of boxes) {
      const parentId = doc.nodes[b.id].parentId;
      if (parentId) expect(b.x).toBeGreaterThan(boxes.find((p) => p.id === parentId)!.x);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  });

  it('hides children of collapsed nodes', () => {
    let doc = createMap();
    const main = addChild(doc, doc.rootId, 'main');
    doc = addChild(main.doc, main.id, 'child').doc;
    doc = { ...doc, nodes: { ...doc.nodes, [main.id]: { ...doc.nodes[main.id], collapsed: true } } };
    expect(layoutMap(doc, measure).size).toBe(2);
  });
});
