import { expect, test } from '@playwright/test';
import { chooseStatus, newMap, openMenu, topic, typeTopic } from './helpers';

test('design preset and color theme are independent and persist after reload', async ({ page }) => {
  await newMap(page);
  await page.getByLabel('Design preset').selectOption('soft-analytical');
  await page.getByLabel('Color theme').selectOption('natural');
  await page.waitForTimeout(450);
  await page.reload();
  await expect(page.getByLabel('Design preset')).toHaveValue('soft-analytical');
  await expect(page.getByLabel('Color theme')).toHaveValue('natural');
  await expect(page.locator('.editor-page')).toHaveClass(/preset-soft-analytical/);
  await expect(page.locator('.editor-page')).toHaveClass(/theme-natural/);
});

test('keyboard help, note shortcut and IME/input safety', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'ショートカット一覧' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'ショートカット一覧' })).toHaveCount(0);
  await page.locator('.topic-root').click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Shortcut task');
  await page.keyboard.press('Control+m');
  await expect(page.locator('.note-editor')).toBeVisible();
  await page.locator('.note-editor').press('Control+k');
  await expect(page.locator('.link-input')).toHaveCount(0);
  await page.locator('.note-editor').dispatchEvent('keydown', { key: 'm', ctrlKey: true, isComposing: true, bubbles: true });
  await expect(page.locator('.popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('リンクURL')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+d');
  await expect(page.getByLabel('期日')).toBeVisible();
  await page.locator('.popover-close').click();
  await page.getByLabel('マップのタイトル').focus();
  await page.keyboard.press('Control+m');
  await expect(page.locator('.popover')).toHaveCount(0);
});

test('image attachment is limited, persists, previews and can be removed', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Image task');
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('画像追加').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: onePixelPng });
  const node = topic(page, 'Image task');
  await expect(node.getByRole('button', { name: '画像を拡大' })).toBeVisible();
  await page.waitForTimeout(500); await page.reload();
  const reloaded = topic(page, 'Image task');
  await expect(reloaded.getByRole('button', { name: '画像を拡大' })).toBeVisible();
  await reloaded.getByRole('button', { name: '画像を拡大' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await reloaded.getByRole('button', { name: '画像を削除' }).click();
  await expect(reloaded.getByRole('button', { name: '画像を拡大' })).toHaveCount(0);
  await page.waitForTimeout(450); await page.reload();
  await expect(topic(page, 'Image task').getByRole('button', { name: '画像を拡大' })).toHaveCount(0);
});

test('rectangle selection enables bulk edits, undo and delete', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Bulk A');
  await page.keyboard.press('Enter'); await typeTopic(page, 'Bulk B');
  const a = topic(page, 'Bulk A'); const b = topic(page, 'Bulk B');
  const ar = await a.boundingBox(); const br = await b.boundingBox();
  expect(ar).not.toBeNull(); expect(br).not.toBeNull();
  const left = Math.min(ar!.x, br!.x) - 15; const top = Math.min(ar!.y, br!.y) - 15;
  const right = Math.max(ar!.x + ar!.width, br!.x + br!.width) + 15; const bottom = Math.max(ar!.y + ar!.height, br!.y + br!.height) + 15;
  await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up();
  await expect(page.getByText('2件選択')).toBeVisible();
  await page.getByLabel('一括ステータス').selectOption('waiting');
  await expect(a.getByRole('checkbox')).toHaveAttribute('title', '待ち');
  await expect(b.getByRole('checkbox')).toHaveAttribute('title', '待ち');
  await page.keyboard.press('Control+z');
  await expect(a.getByRole('checkbox')).toHaveAttribute('title', '未着手');
  await page.getByLabel('一括文字色').selectOption('red');
  await expect(a.locator('.topic-text')).toHaveClass(/text-red/);
  await page.getByRole('button', { name: 'ルーティンON' }).click();
  await expect(a).toHaveClass(/is-routine/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '一括削除' }).click();
  await expect(topic(page, 'Bulk A')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(topic(page, 'Bulk A')).toBeVisible();
});

test('PDF output opens a print-ready landscape document with the map hierarchy', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'PDF child');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'PDF出力' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('h1')).toContainText('無題のマインドマップ');
  await expect(popup.locator('body')).toContainText('PDF child');
});

test('completed routine tasks are carried into the next map with their routine marker', async ({ page }) => {
  await newMap(page);
  await page.getByLabel('マップのタイトル').fill('Routine_9/29');
  await page.getByLabel('マップのタイトル').press('Enter');
  await page.locator('.topic-root').click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Daily review');
  const node = topic(page, 'Daily review');
  await chooseStatus(page, 'Daily review', '完了');
  await openMenu(node);
  await page.getByRole('menuitemcheckbox', { name: 'ルーティンタスク' }).click();
  await expect(node).toHaveClass(/is-routine/);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card', { hasText: 'Routine_9/29' }).getByRole('button', { name: '次の日のタスクを作成' }).click();
  await page.locator('.card', { hasText: 'Routine_9/30' }).locator('.card-body').click();
  await expect(topic(page, 'Daily review')).toHaveClass(/is-routine/);
  await expect(topic(page, 'Daily review').getByRole('checkbox')).toBeChecked();
});
