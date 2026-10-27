import { describe, expect, it } from 'vitest';
import { addChild, createMap, setAttributes, setStatus } from './tree';
import { generateDailyReport, listDailyReportMemos, normalizeDailyReportText, resolveDailyReportDraft } from './dailyReport';
import type { MindMapDoc } from './types';

describe('daily report generation', () => {
  it('converts legacy Markdown category headings to plain-text headings only', () => {
    expect(normalizeDailyReportText('**■ 打合せ**\n・task\nhttps://example.com')).toBe('■打合せ\n・task\nhttps://example.com');
  });

  it('includes done, in-progress and waiting tasks but excludes todo and unset tasks', () => {
    let doc: MindMapDoc = { ...createMap('Daily work'), mapDate: '2026-09-30' };
    const ads = addChild(doc, doc.rootId, '広告運用'); doc = ads.doc;
    const campaign = addChild(doc, ads.id, 'キャンペーン改善'); doc = campaign.doc;
    const done = addChild(doc, campaign.id, '入札単価を調整'); doc = setStatus(done.doc, done.id, 'done');
    doc = setAttributes(doc, done.id, { note: 'CPAを確認して変更', link: 'https://example.com' });
    const progress = addChild(doc, campaign.id, '検索語句を分析'); doc = setStatus(progress.doc, progress.id, 'doing');
    const waiting = addChild(doc, ads.id, '素材承認'); doc = setStatus(waiting.doc, waiting.id, 'waiting');
    const todo = addChild(doc, ads.id, '未着手の入稿'); doc = todo.doc;
    const empty = addChild(doc, doc.rootId, '未着手カテゴリ'); doc = empty.doc;
    const emptyTask = addChild(doc, empty.id, '未着手タスク'); doc = emptyTask.doc;

    const report = generateDailyReport(doc);
    expect(report).toMatch(/^お疲れ様です、田坂です。\n本日の業務報告です。/);
    expect(report).toContain('9月30日 業務日報');
    expect(report).toContain('■広告運用');
    expect(report).toContain('・入札単価を調整');
    expect(report).toContain('・検索語句を分析');
    expect(report).toContain('・素材承認');
    expect(report).not.toContain('を実施');
    expect(report).not.toContain('進行中');
    expect(report).not.toContain('**');
    expect(report).not.toMatch(/（(?:完了|進行中|確認待ち)）/);
    expect(report).toContain('  CPAを確認して変更');
    expect(report).toContain('関連リンク: https://example.com');
    expect(report).not.toContain('未着手');
    expect(report).not.toContain('未着手カテゴリ');
    expect(report.endsWith('以上です。\n本日もありがとうございました。\n明日もどうぞよろしくお願いいたします。\n\n田坂')).toBe(true);
  });

  it('includes every memo by default and excludes only the selected node when memo text is duplicated', () => {
    let doc: MindMapDoc = createMap('Memo filters');
    const category = addChild(doc, doc.rootId, '広告運用'); doc = category.doc;
    const first = addChild(doc, category.id, 'YTS'); doc = setStatus(first.doc, first.id, 'doing');
    doc = setAttributes(doc, first.id, { note: '同じ共有メモ' });
    const second = addChild(doc, category.id, 'TK'); doc = setStatus(second.doc, second.id, 'waiting');
    doc = setAttributes(doc, second.id, { note: '同じ共有メモ' });
    const originalFirstNote = doc.nodes[first.id].note;

    expect(listDailyReportMemos(doc)).toEqual([
      { nodeId: first.id, path: 'Memo filters › 広告運用 › YTS', text: '同じ共有メモ' },
      { nodeId: second.id, path: 'Memo filters › 広告運用 › TK', text: '同じ共有メモ' },
    ]);
    expect(generateDailyReport(doc).match(/同じ共有メモ/g)).toHaveLength(2);

    const excludedDoc = { ...doc, dailyReportExcludedMemoIds: [first.id] };
    const filtered = generateDailyReport(excludedDoc);
    expect(filtered).not.toContain('・YTS\n  同じ共有メモ');
    expect(filtered).toContain('・YTS');
    expect(filtered).toContain('・TK\n  同じ共有メモ');
    expect(filtered.match(/同じ共有メモ/g)).toHaveLength(1);
    expect(resolveDailyReportDraft(excludedDoc, generateDailyReport(doc))).toBe(filtered);
    expect(generateDailyReport({ ...excludedDoc, dailyReportExcludedMemoIds: undefined }).match(/同じ共有メモ/g)).toHaveLength(2);
    expect(doc.nodes[first.id].note).toBe(originalFirstNote);
  });

  it('shows normal task hierarchy when a detailed memo is excluded', () => {
    let doc: MindMapDoc = createMap('Detailed memo exclusion');
    const category = addChild(doc, doc.rootId, 'AD調整');
    doc = setAttributes(category.doc, category.id, { note: '▽YTSモル\n予算を調整' });
    const task = addChild(doc, category.id, 'YTS'); doc = task.doc;
    const child = addChild(doc, task.id, 'モル'); doc = setStatus(child.doc, child.id, 'doing');

    const included = generateDailyReport(doc);
    expect(included).toContain('▽YTSモル');
    expect(included).not.toContain('・YTS');
    const excludedDoc = { ...doc, dailyReportExcludedMemoIds: [category.id] };
    const excluded = generateDailyReport(excludedDoc);
    expect(excluded).not.toContain('▽YTSモル');
    expect(excluded).toContain('〇YTS\n  ・モル');
  });

  it('omits categories without reportable tasks', () => {
    let doc: MindMapDoc = createMap('Empty report');
    const category = addChild(doc, doc.rootId, '未対応'); doc = category.doc;
    addChild(doc, category.id, '未着手タスク');
    const report = generateDailyReport(doc);
    expect(report).not.toContain('■未対応');
    expect(report).toContain('お疲れ様です、田坂です。');
    expect(report).toContain('以上です。');
  });

  it('keeps the selected task memo even when that task also has reportable child work', () => {
    let doc: MindMapDoc = createMap('Memo parent');
    const category = addChild(doc, doc.rootId, '制作'); doc = category.doc;
    const parent = addChild(doc, category.id, 'LP制作'); doc = setStatus(parent.doc, parent.id, 'doing');
    doc = setAttributes(doc, parent.id, { note: '構成案を確認中。文面はそのまま。' });
    doc = addChild(doc, parent.id, '未着手の下位タスク').doc;
    const child = addChild(doc, parent.id, 'ファーストビュー'); doc = setStatus(child.doc, child.id, 'done');
    const report = generateDailyReport(doc);
    expect(report).toContain('・LP制作\n  構成案を確認中。文面はそのまま。');
    expect(report).toContain('  ・ファーストビュー');
  });

  it('keeps multiline notes attached to their nodes and never parses heading-like note text as categories', () => {
    let doc: MindMapDoc = createMap('Memo ownership');
    const yts = addChild(doc, doc.rootId, 'YTSグリル'); doc = yts.doc;
    const ad = addChild(doc, yts.id, 'AD調整'); doc = setStatus(ad.doc, ad.id, 'doing');
    doc = setAttributes(doc, ad.id, { note: '調整内容\n■YTSモル\n・予算を確認\n別カテゴリのような文面' });
    const grill = addChild(doc, yts.id, 'グリル'); doc = setStatus(grill.doc, grill.id, 'waiting');
    doc = setAttributes(doc, grill.id, { note: 'グリル固有のメモ' });

    const report = generateDailyReport(doc);
    expect(report).toContain('■YTSグリル\n・AD調整\n  調整内容\n  ■YTSモル\n  ・予算を確認\n  別カテゴリのような文面\n・グリル\n  グリル固有のメモ');
    expect(report.match(/^■YTSモル$/gm)).toBeNull();
    expect(report).not.toContain('メモ:');
    expect(report.match(/AD調整/g)).toHaveLength(1);
  });

  it('suppresses child tasks and their notes when the parent memo is a detailed report', () => {
    let doc: MindMapDoc = createMap('Separate notes');
    const category = addChild(doc, doc.rootId, '制作'); doc = category.doc;
    const parent = addChild(doc, category.id, 'LP制作'); doc = setStatus(parent.doc, parent.id, 'doing');
    doc = setAttributes(doc, parent.id, { note: '親の複数行メモ\n■別カテゴリ' });
    const todo = addChild(doc, parent.id, '未着手の子タスク'); doc = setAttributes(todo.doc, todo.id, { note: '出力しないメモ' });
    const child = addChild(doc, parent.id, '確認作業'); doc = setStatus(child.doc, child.id, 'waiting');
    doc = setAttributes(doc, child.id, { note: '子タスク固有のメモ\n次の行' });

    const report = generateDailyReport(doc);
    expect(report).toContain('・LP制作\n  親の複数行メモ\n  ■別カテゴリ');
    expect(report).not.toContain('未着手の子タスク');
    expect(report).not.toContain('出力しないメモ');
    expect(report).not.toContain('確認作業');
    expect(report).not.toContain('子タスク固有のメモ');
    expect(report.match(/^■別カテゴリ$/gm)).toBeNull();
    expect(report.match(/確認作業/g)).toBeNull();
  });

  it('uses a detailed AD-style category memo instead of duplicating its child tasks', () => {
    let doc: MindMapDoc = createMap('AD調整');
    const category = addChild(doc, doc.rootId, 'AD調整'); doc = setAttributes(category.doc, category.id, {
      note: '■YTSモル\n昨日日予算を上げたばかりなので様子見\n進捗は良好〇\n■TKモル\nTK案件の報告\n■タブーラモル\nタブーラ案件の報告\n■YTSグリル\nグリル案件の報告',
    });
    const yts = addChild(doc, category.id, 'YTS'); doc = yts.doc;
    const foundation = addChild(doc, yts.id, 'ファンデ'); doc = setStatus(foundation.doc, foundation.id, 'doing');
    const mortar = addChild(doc, yts.id, 'モル'); doc = setStatus(mortar.doc, mortar.id, 'waiting');
    const grill = addChild(doc, yts.id, 'グリル'); doc = setStatus(grill.doc, grill.id, 'done');
    const taboola = addChild(doc, category.id, 'タブーラ'); doc = taboola.doc;
    const taboolaMortar = addChild(doc, taboola.id, 'モル'); doc = setStatus(taboolaMortar.doc, taboolaMortar.id, 'doing');
    const tk = addChild(doc, category.id, 'TK'); doc = tk.doc;
    const tkMortar = addChild(doc, tk.id, 'モル'); doc = setStatus(tkMortar.doc, tkMortar.id, 'waiting');

    const report = generateDailyReport(doc);
    expect(report).toContain('■AD調整\n  ■YTSモル\n  昨日日予算を上げたばかりなので様子見\n  進捗は良好〇\n  ■TKモル\n  TK案件の報告\n  ■タブーラモル\n  タブーラ案件の報告\n  ■YTSグリル\n  グリル案件の報告');
    expect(report).not.toMatch(/^\s*[・〇](?:YTS|タブーラ|TK|ファンデ|モル|グリル)$/m);
    expect(report.match(/■YTSモル/g)).toHaveLength(1);
    expect(report).not.toContain('メモ:');
  });

  it('removes stale duplicate task rows while preserving unrelated edits in a saved draft', () => {
    let doc: MindMapDoc = createMap('AD調整');
    const category = addChild(doc, doc.rootId, 'AD調整'); doc = setAttributes(category.doc, category.id, {
      note: '■YTSモル\n昨日日予算を上げたばかりなので様子見\n進捗は良好〇\n■TKモル\nTK案件の報告',
    });
    const yts = addChild(doc, category.id, 'YTS'); doc = yts.doc;
    const foundation = addChild(doc, yts.id, 'ファンデ'); doc = setStatus(foundation.doc, foundation.id, 'doing');
    const mortar = addChild(doc, yts.id, 'モル'); doc = setStatus(mortar.doc, mortar.id, 'waiting');
    const grill = addChild(doc, yts.id, 'グリル'); doc = setStatus(grill.doc, grill.id, 'done');

    const fresh = generateDailyReport(doc);
    const staleGenerated = fresh.replace(
      '  TK案件の報告\n\n以上です。',
      '  TK案件の報告\n〇YTS\n  ・ファンデ\n  ・モル\n  ・グリル\n\n以上です。',
    );
    expect(staleGenerated).not.toBe(fresh);
    expect(resolveDailyReportDraft(doc, staleGenerated)).toBe(fresh);

    const editedDraft = `${staleGenerated}\n手入力の追記`;
    expect(resolveDailyReportDraft(doc, editedDraft)).toBe(`${fresh}\n手入力の追記`);
  });

  it('uses a detailed nested parent memo instead of duplicating its eligible descendants', () => {
    let doc: MindMapDoc = createMap('Parent memo');
    const category = addChild(doc, doc.rootId, '広告運用'); doc = category.doc;
    const parent = addChild(doc, category.id, 'AD調整');
    doc = setAttributes(parent.doc, parent.id, { note: '■YTSモル\nこの親タスク固有の複数行メモ' });
    const child = addChild(doc, parent.id, 'ファンデ調整'); doc = setStatus(child.doc, child.id, 'doing');

    const report = generateDailyReport(doc);
    expect(report).toContain('■広告運用\n〇AD調整\n  ■YTSモル\n  この親タスク固有の複数行メモ');
    expect(report).not.toContain('ファンデ調整');
    expect(report.match(/^■YTSモル$/gm)).toBeNull();

    const staleDraft = report.replace(
      '  この親タスク固有の複数行メモ\n\n以上です。',
      '  この親タスク固有の複数行メモ\n  ・ファンデ調整\n\n以上です。',
    );
    expect(resolveDailyReportDraft(doc, staleDraft)).toBe(report);
  });

  it('removes old detailed-report descendants even when their current statuses changed', () => {
    let doc: MindMapDoc = createMap('AD調整');
    const category = addChild(doc, doc.rootId, 'AD調整');
    doc = setAttributes(category.doc, category.id, {
      note: '■YTSモル\n予算を調整\n■TKモル\n配信状況を確認\n■タブーラモル\n再開内容\n■YTSグリル\nCR調整\nhttps://example.com/report',
    });
    const yts = addChild(doc, category.id, 'YTS'); doc = setStatus(yts.doc, yts.id, 'done');
    const foundation = addChild(doc, yts.id, 'ファンデ'); doc = setStatus(foundation.doc, foundation.id, 'done');
    const mortar = addChild(doc, yts.id, 'モル'); doc = setStatus(mortar.doc, mortar.id, 'done');
    const grill = addChild(doc, yts.id, 'グリル'); doc = setStatus(grill.doc, grill.id, 'done');
    const tk = addChild(doc, category.id, 'TK'); doc = setStatus(tk.doc, tk.id, 'done');
    const tkMortar = addChild(doc, tk.id, 'モル'); doc = setStatus(tkMortar.doc, tkMortar.id, 'done');
    const taboola = addChild(doc, category.id, 'タブーラ'); doc = setStatus(taboola.doc, taboola.id, 'done');
    const taboolaMortar = addChild(doc, taboola.id, 'モル'); doc = setStatus(taboolaMortar.doc, taboolaMortar.id, 'done');

    // Simulate a saved report produced before detailed-memo suppression existed.
    const generatedBeforeStatusChange = generateDailyReport(doc);
    const staleDraft = generatedBeforeStatusChange.replace(
      '\n\n以上です。',
      '\n・YTS\n  ・ファンデ\n  ・モル\n  ・グリル\n・TK\n  ・モル\n・タブーラ\n  ・モル\n\n以上です。',
    );

    for (const id of [foundation.id, mortar.id, grill.id, tkMortar.id, taboolaMortar.id]) {
      doc = setStatus(doc, id, 'todo');
    }
    const resolved = resolveDailyReportDraft(doc, staleDraft);

    expect(resolved).toContain('■AD調整\n  ■YTSモル\n  予算を調整\n  ■TKモル\n  配信状況を確認\n  ■タブーラモル\n  再開内容\n  ■YTSグリル\n  CR調整\n  https://example.com/report');
    expect(resolved).not.toMatch(/^・(?:YTS|TK|タブーラ)$/m);
    expect(resolved).not.toMatch(/^  ・(?:ファンデ|モル|グリル)$/m);
  });

  it('continues to show children alongside a parent memo without report headings', () => {
    let doc: MindMapDoc = createMap('Simple memo');
    const category = addChild(doc, doc.rootId, '広告運用'); doc = category.doc;
    const parent = addChild(doc, category.id, '打合せ'); doc = setAttributes(parent.doc, parent.id, { note: '議事録を確認' });
    const child = addChild(doc, parent.id, '参加者へ共有'); doc = setStatus(child.doc, child.id, 'doing');

    const report = generateDailyReport(doc);
    expect(report).toContain('〇打合せ\n  議事録を確認\n  ・参加者へ共有');
  });
});
