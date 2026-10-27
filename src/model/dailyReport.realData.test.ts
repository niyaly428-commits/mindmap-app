import { describe, expect, it } from 'vitest';
import { addChild, createMap, setAttributes, setStatus } from './tree';
import { generateDailyReport, resolveDailyReportDraft } from './dailyReport';
import type { MindMapDoc } from './types';

describe('daily report from the 2026-10-31 AD調整 data', () => {
  it('keeps the entire ▽ memo and removes the descendants from generated and saved reports', () => {
    let doc: MindMapDoc = { ...createMap('タスク_10月31日'), mapDate: '2026-10-31' };
    const category = addChild(doc, doc.rootId, 'AD調整');
    doc = setAttributes(category.doc, category.id, {
      note: `▽YTSモル
昨日日予算を上げたばかりなので様子見
進捗は良好〇

▽TKモル
・土日中に新規CP解放→見込みのないCPを停止済み。
・生き残ったCPのCR精査
・新規CPを解放
・母数少ないもののクレカなしLPのほうが良さそう、一旦絞り
・日予算4→8

▽タブーラモル
・審査通ったので再開
・実績ありCRを復活＋新規CR
・日予算3

▽YTSグリル
朝一旦停止
CR調整の上再開
日予算1`,
    });
    const yts = addChild(doc, category.id, 'YTS'); doc = yts.doc;
    const ytsChildIds: string[] = [];
    for (const name of ['ファンデ', 'モル', 'グリル']) {
      const child = addChild(doc, yts.id, name); ytsChildIds.push(child.id); doc = setStatus(child.doc, child.id, 'done');
    }
    const tk = addChild(doc, category.id, 'TK'); doc = tk.doc;
    const tkMortar = addChild(doc, tk.id, 'モル'); doc = setStatus(tkMortar.doc, tkMortar.id, 'done');
    const taboola = addChild(doc, category.id, 'タブーら'); doc = taboola.doc;
    const taboolaMortar = addChild(doc, taboola.id, 'モル'); doc = setStatus(taboolaMortar.doc, taboolaMortar.id, 'done');

    const other = addChild(doc, doc.rootId, 'その他'); doc = other.doc;
    for (const name of ['ナハト', 'アシスト', '打合せ']) {
      const task = addChild(doc, other.id, name); doc = setStatus(task.doc, task.id, 'done');
    }

    const realIds: Record<string, string> = {
      [category.id]: '48b982b0-73fa-46a5-a55d-640656c3bb1b',
      [yts.id]: 'fe419249-46ab-4645-8683-c259dfc9aa8f',
      [ytsChildIds[0]]: 'b791069d-1b7d-4412-9ba2-68cf5245580f',
      [ytsChildIds[1]]: 'f0ccfd9e-dbdd-41d8-9e57-46fa60acdb3c',
      [ytsChildIds[2]]: '4b3c1f61-0525-43c4-b6f2-3369176f9296',
      [tk.id]: '36daebc2-4630-4b8f-9406-69f8e7939945',
      [tkMortar.id]: '1ae91291-9162-4b66-989e-77bf75595876',
      [taboola.id]: '861044cd-dd45-4a78-bd89-1142c6c1cedf',
      [taboolaMortar.id]: 'fa66021d-6de7-4ead-a698-cd59468b22e5',
    };
    doc = {
      ...doc,
      id: '849b3739-c8c4-4e16-9c54-6053d6d8ba93',
      nodes: Object.fromEntries(Object.values(doc.nodes).map((node) => {
        const id = realIds[node.id] ?? node.id;
        return [id, {
          ...node,
          id,
          parentId: node.parentId ? realIds[node.parentId] ?? node.parentId : null,
          children: node.children.map((childId) => realIds[childId] ?? childId),
        }];
      })),
    };

    const memo = doc.nodes[realIds[category.id]].note!;
    const expectedMemo = memo.split('\n').map((line) => `  ${line}`).join('\n');
    const generated = generateDailyReport(doc);
    expect(generated).toContain(expectedMemo);
    expect(generated).not.toContain('・YTS\n  ・ファンデ\n  ・モル\n  ・グリル');
    expect(generated).not.toContain('・TK\n  ・モル');
    expect(generated).not.toContain('・タブーら\n  ・モル');
    for (const name of ['ナハト', 'アシスト', '打合せ']) expect(generated).toContain(`・${name}`);

    const duplicateRows = '\n・YTS\n  ・ファンデ\n  ・モル\n  ・グリル\n・TK\n  ・モル\n・タブーら\n  ・モル';
    const staleSavedReport = generated.replace('  日予算1\n', `  日予算1${duplicateRows}\n`);
    expect(staleSavedReport).toContain(duplicateRows);
    const resolved = resolveDailyReportDraft(doc, staleSavedReport);
    expect(resolved).toContain(expectedMemo);
    expect(resolved).not.toContain('・YTS\n  ・ファンデ\n  ・モル\n  ・グリル');
    expect(resolved).not.toContain('・TK\n  ・モル');
    expect(resolved).not.toContain('・タブーら\n  ・モル');
    for (const name of ['ナハト', 'アシスト', '打合せ']) expect(resolved).toContain(`・${name}`);
  });
});
