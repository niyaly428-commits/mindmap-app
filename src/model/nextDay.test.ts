import { describe, expect, it } from 'vitest';
import { createNextDayMap, nextDayTitle } from './nextDay';
import { addChild, createMap, setAttributes, setStatus, toggleChecked } from './tree';
import type { MindMapDoc } from './types';

const sep29 = new Date(2026, 8, 29);

describe('nextDayTitle', () => {
  it.each([
    ['タスク_9月29日', 'タスク_9月30日'],
    ['タスク_9月30日', 'タスク_10月1日'],
    ['09月09日のタスク', '09月10日のタスク'],
    ['2026年12月31日', '2027年1月1日'],
    ['2026/09/29 作業', '2026/09/30 作業'],
    ['2026-02-28', '2026-03-01'],
    ['日報 9/29', '日報 9/30'],
  ])('%s -> %s', (input, expected) => {
    expect(nextDayTitle(input, sep29)).toBe(expected);
  });

  it('uses the year of the source map for M月D日 (leap years)', () => {
    expect(nextDayTitle('2月28日', new Date(2028, 0, 1))).toBe('2月29日');
    expect(nextDayTitle('2月28日', new Date(2027, 0, 1))).toBe('3月1日');
  });

  it('falls back to タスク_M月D日 of the day after the source date', () => {
    expect(nextDayTitle('旅行計画', sep29)).toBe('タスク_9月30日');
    expect(nextDayTitle('13月40日', sep29)).toBe('タスク_9月30日');
  });
});

describe('createNextDayMap', () => {
  /**
   * 外注 □ (A ☑, B □, C ☑) — unfinished, carried over as a whole
   * 完了 ☑ (D ☑)            — finished, dropped
   */
  function source(): MindMapDoc {
    let doc = createMap('タスク_9月29日', sep29.getTime());
    const add = (parent: string, text: string) => {
      const r = addChild(doc, parent, text);
      doc = r.doc;
      return r.id;
    };
    const gaichu = add(doc.rootId, '外注');
    const a = add(gaichu, 'A');
    const bId = add(gaichu, 'B');
    const c = add(gaichu, 'C');
    const done = add(doc.rootId, '完了');
    add(done, 'D');
    doc = toggleChecked(toggleChecked(doc, a), c);
    doc = toggleChecked(doc, done);
    doc = setStatus(doc, gaichu, 'waiting');
    doc = setAttributes(doc, gaichu, {
      note: 'メモ https://example.com',
      link: 'https://example.com',
      dueDate: '2026-10-03',
      bold: true,
      textColor: 'red',
    });
    doc = setStatus(doc, bId, 'doing');
    doc = setAttributes(doc, bId, { textColor: 'orange', dueDate: '2026-09-30' });
    return doc;
  }

  it('carries over unfinished main topics with their whole subtree and states', () => {
    const src = source();
    const next = createNextDayMap(src);
    const root = next.nodes[next.rootId];
    expect(next.title).toBe('タスク_9月30日');
    expect(root.text).toBe('タスク_9月30日');
    expect(root.children).toHaveLength(1);

    const gaichu = next.nodes[root.children[0]];
    expect(gaichu).toMatchObject({
      text: '外注',
      checked: false,
      status: 'waiting',
      link: 'https://example.com',
      dueDate: '2026-10-03',
      bold: true,
      textColor: 'red',
    });
    expect(gaichu.note).toContain('メモ');
    const b = next.nodes[gaichu.children[1]];
    expect(b).toMatchObject({ text: 'B', status: 'doing', textColor: 'orange', dueDate: '2026-09-30' });
    expect(gaichu.children.map((id) => [next.nodes[id].text, next.nodes[id].checked])).toEqual([
      ['A', true],
      ['B', false],
      ['C', true],
    ]);
    for (const id of gaichu.children) expect(next.nodes[id].parentId).toBe(gaichu.id);
    expect(Object.keys(next.nodes)).toHaveLength(5);
  });

  it('does not modify the source and uses new ids', () => {
    const src = source();
    const snapshot = structuredClone(src);
    const next = createNextDayMap(src);
    expect(src).toEqual(snapshot);
    expect(next.id).not.toBe(src.id);
    for (const id of Object.keys(next.nodes)) expect(src.nodes[id]).toBeUndefined();
  });

  it('always carries routine main tasks, including completed ones, and preserves the routine flag', () => {
    let source = createMap('Routine');
    const routine = addChild(source, source.rootId, 'Every day'); source = routine.doc;
    source = setAttributes(source, routine.id, { routine: true });
    source = setStatus(source, routine.id, 'done');
    const ordinary = addChild(source, source.rootId, 'One off'); source = setStatus(ordinary.doc, ordinary.id, 'done');
    const next = createNextDayMap(source, 2000);
    const copied = next.nodes[next.rootId].children.map((id) => next.nodes[id]);
    expect(copied.map((n) => n.text)).toEqual(['Every day']);
    expect(copied[0].routine).toBe(true);
    expect(copied[0].checked).toBe(true);
  });

  it('keeps a routine descendant even inside an otherwise completed main branch', () => {
    let source = createMap('Routine descendant');
    const branch = addChild(source, source.rootId, 'Finished branch'); source = branch.doc;
    const daily = addChild(source, branch.id, 'Daily check'); source = setAttributes(daily.doc, daily.id, { routine: true });
    source = setStatus(source, branch.id, 'done');
    const next = createNextDayMap(source);
    const main = next.nodes[next.rootId].children.map((id) => next.nodes[id]);
    expect(main.map((n) => n.text)).toEqual(['Finished branch']);
    const copiedRoutine = next.nodes[main[0].children[0]];
    expect(copiedRoutine).toMatchObject({ text: 'Daily check', routine: true });
  });
});
