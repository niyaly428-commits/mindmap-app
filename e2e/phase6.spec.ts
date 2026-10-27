import { expect, test } from '@playwright/test';
import { chooseStatus, newMap, openMenu, topic, typeTopic } from './helpers';

test('toolbar offers compact task actions and Focus Today can be reset', async ({ page }) => {
  await newMap(page);
  for (const label of ['Child', 'Sibling', 'Delete', 'Focus Today']) await expect(page.getByRole('button', { name: label })).toBeVisible();
  await page.getByRole('button', { name: 'Child' }).click();
  await typeTopic(page, 'Toolbar child');
  await expect(page.getByRole('button', { name: 'Sibling' })).toBeEnabled();
  await page.getByRole('button', { name: 'Focus Today' }).click();
  await expect(page.getByRole('button', { name: 'Reset View' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reset View' }).click();
  await expect(page.getByRole('button', { name: 'Focus Today' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(topic(page, 'Toolbar child')).toHaveCount(0);
});

test('tasks remain draggable during Focus Today and Reset View restores the normal layout', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Focus parent');
  await page.keyboard.press('Tab'); await typeTopic(page, 'Focus child');
  const child = topic(page, 'Focus child');
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Focus Today' }).click();
  await page.waitForTimeout(350);
  const start = await child.boundingBox();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x + start!.width / 2 + 170, start!.y + start!.height / 2 + 90, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Reset View' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => child.boundingBox()).not.toEqual(start);
  const moved = await child.boundingBox();
  await expect(topic(page, 'Focus parent')).toBeVisible();
  expect(moved!.x).toBeGreaterThan(start!.x + 80);
  await page.getByRole('button', { name: 'Reset View' }).click();
  await expect(page.getByRole('button', { name: 'Focus Today' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => child.boundingBox()).not.toEqual(moved);
  const reset = await child.boundingBox();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(topic(page, 'Focus child')).toBeVisible();
  await page.waitForTimeout(400);
  const persisted = await topic(page, 'Focus child').boundingBox();
  // Temporary Focus Today drags must not be written to the ordinary saved layout.
  expect(Math.abs(reset!.x - persisted!.x)).toBeLessThan(40);
});

test('completed tasks suppress due colors and reopening restores urgency', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, 'Due task');
  let node = topic(page, 'Due task');
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await openMenu(node);
  await page.getByRole('menuitem', { name: /期日/ }).click();
  await page.getByLabel('期日').fill(today);
  await page.locator('.popover-actions').getByRole('button').last().click();
  node = topic(page, 'Due task');
  await expect(node).toHaveClass(/has-due/);
  await chooseStatus(page, 'Due task', '完了');
  await expect(node).toHaveClass(/is-checked/);
  await expect(node).not.toHaveClass(/has-due/);
  await chooseStatus(page, 'Due task', '進行中');
  await expect(node).toHaveClass(/has-due/);

  await node.getByLabel(/期日/).click();
  await page.locator('input[type="date"]').fill('2020-01-01');
  await page.locator('.popover-actions').getByRole('button').last().click();
  await expect(node).toHaveClass(/due-overdue/);
  await chooseStatus(page, 'Due task', '完了');
  await expect(node).not.toHaveClass(/has-due/);
  await chooseStatus(page, 'Due task', '未着手');
  await expect(node).toHaveClass(/due-overdue/);
});

test('cloud sync panel keeps local mode available when credentials are not configured', async ({ page }) => {
  await newMap(page);
  await page.getByRole('button', { name: /Cloud sync:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud sync' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/ローカル保存はそのまま利用できます/)).toBeVisible();
});

test('map editing still writes to IndexedDB while the browser is offline', async ({ page, context }) => {
  await newMap(page);
  await context.setOffline(true);
  await page.keyboard.press('Tab');
  await typeTopic(page, 'Offline task');
  await expect(topic(page, 'Offline task')).toBeVisible();
  await page.waitForTimeout(450);
  await expect(topic(page, 'Offline task')).toBeVisible();
});

test('daily report keeps task names and memos verbatim and copies plain text', async ({ page, context }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, '打合せ');
  await page.keyboard.press('Tab'); await typeTopic(page, '議事録の確認');
  await chooseStatus(page, '議事録の確認', '進行中');
  await openMenu(topic(page, '議事録の確認'));
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.getByLabel('メモ').fill('URLを確認 https://example.com');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card').getByRole('button', { name: '日報' }).click();

  const report = page.getByLabel('生成した文章は自由に編集できます。');
  await expect.poll(() => report.inputValue()).toContain('お疲れ様です、田坂です。');
  await expect.poll(() => report.inputValue()).toContain('■打合せ');
  await expect.poll(() => report.inputValue()).toContain('・議事録の確認');
  await expect.poll(() => report.inputValue()).toContain('  URLを確認 https://example.com');
  expect(await report.inputValue()).not.toContain('メモ:');
  expect(await report.inputValue()).not.toContain('**');
  expect(await report.inputValue()).not.toContain('を実施');
  await expect(page.locator('.daily-report-preview').locator('strong')).toContainText('■打合せ');

  const edited = `${await report.inputValue()}\n追記`;
  await report.fill(edited);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存済み')).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: '全文をコピー' }).click();
  await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(edited);
});

test('daily report includes the memo on an AD-style category with reportable child tasks', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'AD調整');
  await openMenu(topic(page, 'AD調整'));
  await page.getByRole('menuitem', { name: 'メモ' }).click();
  await page.getByLabel('メモ').fill('■YTSモル\n昨日日予算を上げたばかりなので様子見\n進捗は良好〇');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await topic(page, 'AD調整').click();
  await page.keyboard.press('Tab'); await typeTopic(page, 'YTS');
  await page.keyboard.press('Tab'); await typeTopic(page, 'ファンデ');
  await chooseStatus(page, 'ファンデ', '進行中');
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card').getByRole('button', { name: '日報' }).click();

  const report = page.getByLabel('生成した文章は自由に編集できます。');
  await expect.poll(() => report.inputValue()).toContain('■AD調整\n  ■YTSモル\n  昨日日予算を上げたばかりなので様子見\n  進捗は良好〇');
  const generatedReport = await report.inputValue();
  expect(await report.inputValue()).not.toContain('メモ:');
  expect(await report.inputValue()).not.toContain('ファンデ');

  // A previously saved generated report may still contain the old descendant block.
  // Reopening must remove only those duplicates while retaining unrelated user edits.
  const staleDraft = `${(await report.inputValue()).replace('\n\n以上です。', '\n〇YTS\n  ・ファンデ\n\n以上です。')}\n手入力の追記`;
  await report.fill(staleDraft);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存済み')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.locator('.card').getByRole('button', { name: '日報' }).click();
  const reopenedReport = page.getByLabel('生成した文章は自由に編集できます。');
  await expect.poll(() => reopenedReport.inputValue()).not.toContain('ファンデ');
  await expect.poll(() => reopenedReport.inputValue()).toContain('手入力の追記');

  // Register exactly one handler for the replacement confirmation, matching
  // the proven regeneration test pattern and avoiding a stale dialog listener.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '再生成' }).click();
  await expect(reopenedReport).toHaveValue(generatedReport);
  await expect(page.locator('.daily-report-preview')).not.toContainText('手入力の追記');
  await expect(page.locator('.daily-report-preview')).toContainText('■YTSモル');
});
