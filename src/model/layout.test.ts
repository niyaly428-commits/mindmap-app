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

  it('uses measured sizes so long (e.g. URL) topics never overlap', () => {
    let doc = createMap();
    const main = addChild(doc, doc.rootId, 'main');
    doc = main.doc;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = addChild(doc, main.id, `https://example.com/${'x'.repeat(40 * i)}`);
      doc = r.doc;
      ids.push(r.id);
      for (let j = 0; j < 2; j++) doc = addChild(doc, r.id, `leaf ${i}-${j}`).doc;
    }
    // Simulate rendered sizes: wrapped URLs become tall, some nodes wide.
    const measured = new Map(ids.map((id, i) => [id, { width: 260, height: 30 + i * 60 }]));
    const boxes = [...layoutMap(doc, measure, measured).values()];
    for (const id of ids) expect(boxes.find((b) => b.id === id)).toMatchObject(measured.get(id)!);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    // Children sit to the right of their (wide) parent.
    for (const b of boxes) {
      const p = doc.nodes[b.id].parentId;
      const pb = boxes.find((x) => x.id === p);
      if (pb) expect(b.x).toBeGreaterThanOrEqual(pb.x + pb.width);
    }
  });

  it('hides children of collapsed nodes', () => {
    let doc = createMap();
    const main = addChild(doc, doc.rootId, 'main');
    doc = addChild(main.doc, main.id, 'child').doc;
    doc = { ...doc, nodes: { ...doc.nodes, [main.id]: { ...doc.nodes[main.id], collapsed: true } } };
    expect(layoutMap(doc, measure).size).toBe(2);
  });

  it('keeps an explicit drag position and separates another colliding subtree', () => {
    let doc = createMap();
    const first = addChild(doc, doc.rootId, 'First'); doc = first.doc;
    const second = addChild(doc, doc.rootId, 'Second'); doc = second.doc;
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [first.id]: { ...doc.nodes[first.id], position: { x: 420, y: 40 } },
        [second.id]: { ...doc.nodes[second.id], position: { x: 420, y: 40 } },
      },
    };
    const boxes = layoutMap(doc, measure);
    expect(boxes.get(first.id)).toMatchObject({ x: 420, y: 40 });
    expect(overlaps(boxes.get(first.id)!, boxes.get(second.id)!)).toBe(false);
    const positions = [...boxes.values()];
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++) expect(overlaps(positions[i], positions[j])).toBe(false);
  });

  it.each(['soft-organic', 'clean-structured', 'soft-analytical'] as const)(
    '%s keeps the parent on the root side while a dragged child branch extends left',
    (preset) => {
      let doc = createMap();
      const parent = addChild(doc, doc.rootId, 'Parent'); doc = parent.doc;
      const child = addChild(doc, parent.id, 'Dragged child'); doc = child.doc;
      const grandchild = addChild(doc, child.id, 'Grandchild'); doc = grandchild.doc;
      doc = {
        ...doc,
        nodes: {
          ...doc.nodes,
          [child.id]: { ...doc.nodes[child.id], side: 'left' },
        },
      };
      const boxes = layoutMap(doc, measure, undefined, preset);
      const rootBox = boxes.get(doc.rootId)!;
      const parentBox = boxes.get(parent.id)!;
      const childBox = boxes.get(child.id)!;
      const grandchildBox = boxes.get(grandchild.id)!;
      expect(parentBox.x).toBeGreaterThan(rootBox.x + rootBox.width);
      expect(childBox.x + childBox.width).toBeLessThan(parentBox.x);
      expect(grandchildBox.x + grandchildBox.width).toBeLessThan(childBox.x);
      expect(doc.nodes[child.id].parentId).toBe(parent.id);
      const all = [...boxes.values()];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
    },
  );

  it('moves auto-laid descendants with a manually anchored branch after a side flip', () => {
    let doc = createMap();
    const parent = addChild(doc, doc.rootId, 'Parent'); doc = parent.doc;
    const child = addChild(doc, parent.id, 'Child'); doc = child.doc;
    const grandchild = addChild(doc, child.id, 'Grandchild'); doc = grandchild.doc;
    doc = {
      ...doc,
      nodes: {
        ...doc.nodes,
        [child.id]: { ...doc.nodes[child.id], side: 'left', position: { x: -500, y: 120 } },
      },
    };
    const boxes = layoutMap(doc, measure);
    expect(boxes.get(child.id)).toMatchObject({ x: -500, y: 120 });
    expect(boxes.get(grandchild.id)!.x + boxes.get(grandchild.id)!.width).toBeLessThan(boxes.get(child.id)!.x);
    expect(boxes.get(parent.id)!.x).toBeGreaterThan(boxes.get(doc.rootId)!.x + boxes.get(doc.rootId)!.width);
  });

  it.each(['clean-structured', 'soft-analytical'] as const)('%s keeps a deep multi-sibling layout readable', (preset) => {
    let doc = createMap();
    const main = addChild(doc, doc.rootId, 'main'); doc = main.doc;
    for (let i = 0; i < 4; i++) {
      const child = addChild(doc, main.id, `child ${i}`); doc = child.doc;
      for (let j = 0; j < 3; j++) doc = addChild(doc, child.id, `leaf ${i}-${j}`).doc;
    }
    const boxes = [...layoutMap(doc, measure, undefined, preset).values()];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    for (const box of boxes) {
      const parent = doc.nodes[box.id].parentId;
      if (parent) {
        const parentBox = boxes.find((candidate) => candidate.id === parent)!;
        const routeGap = 32;
        const actualGap = box.side === 'left'
          ? parentBox.x - (box.x + box.width)
          : box.x - (parentBox.x + parentBox.width);
        expect(actualGap).toBeGreaterThanOrEqual(routeGap);
      }
    }
    for (const node of Object.values(doc.nodes)) {
      const childrenBySide = new Map<string, number[]>();
      for (const id of node.children) {
        const box = boxes.find((candidate) => candidate.id === id)!;
        const centers = childrenBySide.get(String(box.side)) ?? [];
        centers.push(box.y + box.height / 2); childrenBySide.set(String(box.side), centers);
      }
      for (const centers of childrenBySide.values()) expect(centers).toEqual([...centers].sort((a, b) => a - b));
    }
  });
});
