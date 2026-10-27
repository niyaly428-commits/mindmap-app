import { expect, test } from '@playwright/test';
import { chooseStatus, newMap, openMenu, topic, typeTopic } from './helpers';

test('timeline stacks multiple maps for the same date', async ({ page }) => {
  await newMap(page);
  const sourceId = new URL(page.url()).hash.split('/').at(-1)!;
  await page.locator('.toolbar button').first().click();
  await expect(page.locator('.timeline-day')).toHaveCount(1);

  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mindmap-app');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('maps', 'readwrite');
      const store = tx.objectStore('maps');
      const source = await new Promise<Record<string, any>>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('source map missing'));
        request.onerror = () => reject(request.error);
      });
      store.add({ ...structuredClone(source), id: crypto.randomUUID(), title: `${source.title} copy`, updatedAt: Date.now() + 1 });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, sourceId);

  await page.reload();
  await expect(page.locator('.timeline-day')).toHaveCount(1);
  await expect(page.locator('.timeline-day-heading span')).toHaveText('2 maps');
  await expect(page.locator('.timeline-card')).toHaveCount(2);
});

test('bulk text styling persists and background color is included in PDF output', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Style A');
  await page.keyboard.press('Enter'); await typeTopic(page, 'Style B');
  const a = topic(page, 'Style A');
  const b = topic(page, 'Style B');
  const ar = await a.boundingBox();
  const br = await b.boundingBox();
  expect(ar).not.toBeNull(); expect(br).not.toBeNull();
  const left = Math.min(ar!.x, br!.x) - 15;
  const top = Math.min(ar!.y, br!.y) - 15;
  const right = Math.max(ar!.x + ar!.width, br!.x + br!.width) + 15;
  const bottom = Math.max(ar!.y + ar!.height, br!.y + br!.height) + 15;
  await page.keyboard.down('Shift');
  await page.mouse.move(left, top); await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.topic.is-multi-selected')).toHaveCount(2);

  const styles = page.locator('.text-style-group');
  await styles.locator('.bold-btn').click();
  await styles.locator('.color-btn').nth(1).click();
  await styles.locator('.background-color-btn').first().click();
  for (const node of [a, b]) {
    await expect(node.locator('.topic-text')).toHaveClass(/is-bold/);
    await expect(node.locator('.topic-text')).toHaveClass(/text-red/);
    await expect(node).toHaveClass(/task-bg-yellow/);
  }

  await page.waitForTimeout(450);
  await page.reload();
  for (const name of ['Style A', 'Style B']) {
    const node = topic(page, name);
    await expect(node.locator('.topic-text')).toHaveClass(/is-bold/);
    await expect(node.locator('.topic-text')).toHaveClass(/text-red/);
    await expect(node).toHaveClass(/task-bg-yellow/);
  }

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'PDF出力' }).click();
  const popup = await popupPromise;
  const printed = popup.locator('.mindmap-node').filter({ hasText: 'Style A' });
  await expect(printed).toHaveCSS('background-color', 'rgb(251, 242, 210)');
  await expect(printed.locator('strong')).toHaveCSS('font-weight', '750');
  await expect(printed.locator('strong')).toHaveCSS('color', 'rgb(224, 49, 49)');
});

test('daily report memo exclusions distinguish identical notes and persist across regeneration', async ({ page }) => {
  await newMap(page);
  const mapId = new URL(page.url()).hash.split('/').at(-1)!;
  await page.keyboard.press('Tab'); await typeTopic(page, '広告運用');
  await page.keyboard.press('Tab'); await typeTopic(page, 'Task A');
  await chooseStatus(page, 'Task A', '進行中');
  await openMenu(topic(page, 'Task A'));
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.locator('.note-editor').fill('同じ共有メモ');
  await page.keyboard.press('Escape');
  await topic(page, 'Task A').click();
  await page.keyboard.press('Enter'); await typeTopic(page, 'Task B');
  await chooseStatus(page, 'Task B', '待ち');
  await openMenu(topic(page, 'Task B'));
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.locator('.note-editor').fill('同じ共有メモ');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card').getByRole('button', { name: '日報' }).click();

  const report = page.locator('#daily-report-text');
  const taskAMemo = page.getByRole('checkbox', { name: /Task A のメモを日報に反映/ });
  const taskBMemo = page.getByRole('checkbox', { name: /Task B のメモを日報に反映/ });
  await expect(taskAMemo).toBeChecked();
  await expect(taskBMemo).toBeChecked();
  await expect.poll(() => report.inputValue()).toContain('同じ共有メモ');
  expect((await report.inputValue()).match(/同じ共有メモ/g)).toHaveLength(2);

  await taskAMemo.uncheck();
  await expect(taskBMemo).toBeChecked();
  await expect.poll(() => report.inputValue()).toContain('・Task A\n・Task B\n  同じ共有メモ');
  expect((await report.inputValue()).match(/同じ共有メモ/g)).toHaveLength(1);
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.locator('.card').getByRole('button', { name: '日報' }).click();
  await expect(page.getByRole('checkbox', { name: /Task A のメモを日報に反映/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Task B のメモを日報に反映/ })).toBeChecked();
  await page.getByRole('button', { name: '再生成' }).click();
  await expect.poll(() => report.inputValue()).toContain('・Task A\n・Task B\n  同じ共有メモ');

  const stored = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mindmap-app');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, any>>((resolve, reject) => {
        const request = db.transaction('maps').objectStore('maps').get(id);
        request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('map missing'));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, mapId);
  expect(stored.nodes[Object.keys(stored.nodes).find((id) => stored.nodes[id].text === 'Task A')!].note).toBe('同じ共有メモ');
  expect(stored.nodes[Object.keys(stored.nodes).find((id) => stored.nodes[id].text === 'Task B')!].note).toBe('同じ共有メモ');
  expect(stored.dailyReportExcludedMemoIds).toHaveLength(1);
});

test('recent days, collapsed month groups, and pins retain maps in date order', async ({ page }) => {
  await newMap(page);
  const sourceId = new URL(page.url()).hash.split('/').at(-1)!;
  await page.getByRole('button', { name: '← 一覧' }).click();
  const now = new Date();
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  const currentMonthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const previousMonthNew = dateKey(new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 20, 12));
  const previousMonthPinned = dateKey(new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 18, 12));
  const previousMonthOld = dateKey(new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 3, 12));
  const twoMonthsAgo = dateKey(new Date(now.getFullYear(), now.getMonth() - 2, 15, 12));
  const yesterday = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  const twoDaysAgo = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 12));
  const threeDaysAgo = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12));
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
  const previousMonthLabel = `${previousMonth.getFullYear()}年${previousMonth.getMonth() + 1}月`;

  await page.evaluate(async ({ id, dates }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mindmap-app');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('maps', 'readwrite');
      const store = tx.objectStore('maps');
      const source = await new Promise<Record<string, any>>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('source map missing'));
        request.onerror = () => reject(request.error);
      });
      const entries = [
        { title: 'Same day copy', mapDate: source.mapDate, updatedAt: Date.now() + 10 },
        { title: 'Yesterday map', mapDate: dates.yesterday, updatedAt: Date.now() + 11 },
        { title: 'Two days ago map', mapDate: dates.twoDaysAgo, updatedAt: Date.now() + 12 },
        { title: 'Three days ago map', mapDate: dates.threeDaysAgo, updatedAt: Date.now() + 13 },
        { title: 'Future date map', mapDate: dates.tomorrow, updatedAt: Date.now() + 14 },
        { title: 'Older month newer', mapDate: dates.previousMonthNew, updatedAt: Date.now() + 9 },
        { title: 'Pinned old map', mapDate: dates.previousMonthPinned, updatedAt: Date.now() + 8 },
        { title: 'Older month earlier', mapDate: dates.previousMonthOld, updatedAt: Date.now() + 7 },
        { title: 'Previous month map', mapDate: dates.twoMonthsAgo, updatedAt: Date.now() + 6 },
      ];
      for (const entry of entries) store.add({ ...structuredClone(source), ...entry, id: crypto.randomUUID(), pinned: false });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { id: sourceId, dates: { previousMonthNew, previousMonthPinned, previousMonthOld, twoMonthsAgo, yesterday, twoDaysAgo, threeDaysAgo, tomorrow } });

  await page.reload();
  await expect(page.locator('.timeline-recent .timeline-day')).toHaveCount(3);
  await expect(page.locator('.timeline-recent .timeline-day-heading h3')).toHaveText([
    new RegExp(`今日.*${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`),
    new RegExp(`昨日.*${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getFullYear()}年${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getMonth() + 1}月${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getDate()}日`),
    new RegExp(`一昨日.*${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getFullYear()}年${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getMonth() + 1}月${new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).getDate()}日`),
  ]);
  await expect(page.locator('.timeline-recent .timeline-day-heading span')).toHaveText(['2 maps', '1 map', '1 map']);
  await expect(page.locator('.timeline-future .timeline-day .card-title')).toHaveText('Future date map');
  await expect(page.locator('.timeline-month-toggle')).toHaveCount(3);
  await expect(page.locator('.timeline-month-label')).toHaveText([currentMonthLabel, previousMonthLabel, `${now.getFullYear()}年${now.getMonth() - 1}月`]);
  await expect(page.getByText('Older month newer', { exact: true })).toHaveCount(0);

  const currentMonth = page.locator('.timeline-month').first();
  await currentMonth.locator('.timeline-month-toggle').click();
  await expect(currentMonth.locator('.timeline-month-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(currentMonth.locator('.timeline-card .card-title')).toHaveText('Three days ago map');
  const firstMonth = page.locator('.timeline-month').nth(1);
  await firstMonth.locator('.timeline-month-toggle').click();
  await expect(firstMonth.locator('.timeline-card .card-title')).toHaveText(['Older month newer', 'Pinned old map', 'Older month earlier']);
  await firstMonth.locator('.timeline-card').filter({ hasText: 'Pinned old map' }).getByRole('button', { name: 'ピン留め' }).click();
  await expect(page.locator('.timeline-pinned .card-title')).toHaveText('Pinned old map');
  await expect(firstMonth.locator('.timeline-card .card-title')).toHaveText(['Older month newer', 'Older month earlier']);

  await page.reload();
  await expect(page.locator('.timeline-pinned .card-title')).toHaveText('Pinned old map');
  await page.locator('.timeline-pinned .timeline-card').getByRole('button', { name: 'ピン留め解除' }).click();
  await expect(page.locator('.timeline-pinned .card-title')).toHaveCount(0);
  const oldMonth = page.locator('.timeline-month').nth(1);
  await oldMonth.locator('.timeline-month-toggle').click();
  await expect(oldMonth.locator('.timeline-card .card-title')).toHaveText(['Older month newer', 'Pinned old map', 'Older month earlier']);
  await page.reload();
  await expect(page.locator('.timeline-pinned .card-title')).toHaveCount(0);
  await page.locator('.timeline-month').nth(1).locator('.timeline-month-toggle').click();
  await expect(page.locator('.timeline-month').nth(1).locator('.timeline-card .card-title')).toHaveText(['Older month newer', 'Pinned old map', 'Older month earlier']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.timeline-pinned-heading')).toBeVisible();
  await expect(page.locator('.timeline-card').first().getByRole('button', { name: 'ピン留め' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
