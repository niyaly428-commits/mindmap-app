import { expect, test } from '@playwright/test';
import { chooseStatus, newMap, openMenu, statusOf, topic, typeTopic } from './helpers';

test('due date can be set, shown, removed and persisted', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, '外注');
  const node = topic(page, '外注');

  await openMenu(node);
  await page.getByRole('menuitem', { name: /期日/ }).click();
  await page.getByLabel('期日').fill('2026-10-03');
  await page.locator('.popover-actions').getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('.popover')).toHaveCount(0);

  const badge = node.getByLabel(/期日/);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('10/3');
  await expect(node).toHaveClass(/has-due/);

  await page.waitForTimeout(600);
  await page.reload();
  const reloaded = topic(page, '外注');
  await expect(reloaded.getByLabel(/期日/)).toContainText('10/3');
  await expect(reloaded).toHaveClass(/has-due/);

  await reloaded.getByLabel(/期日/).click();
  await page.getByRole('button', { name: '期日を削除' }).click();
  await expect(topic(page, '外注').getByLabel(/期日/)).toHaveCount(0);
  await expect(topic(page, '外注')).not.toHaveClass(/has-due/);

  await page.waitForTimeout(600);
  await page.reload();
  await expect(topic(page, '外注').getByLabel(/期日/)).toHaveCount(0);
});

test('bold, Ctrl+B and four text colors persist', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, '見出し');
  const node = topic(page, '見出し');
  const text = node.locator('.topic-text');
  await node.click();

  await page.getByRole('button', { name: '太字 (Ctrl+B)' }).click();
  await expect(text).toHaveClass(/is-bold/);
  await page.keyboard.press('Control+b');
  await expect(text).not.toHaveClass(/is-bold/);
  await page.keyboard.press('Control+b');
  await expect(text).toHaveClass(/is-bold/);

  await page.getByRole('button', { name: '文字色: 赤' }).click();
  await expect(text).toHaveClass(/text-red/);
  await page.getByRole('button', { name: '文字色: 青' }).click();
  await expect(text).toHaveClass(/text-blue/);
  await expect(text).not.toHaveClass(/text-red/);
  await page.getByRole('button', { name: '文字色: オレンジ' }).click();
  await expect(text).toHaveClass(/text-orange/);
  await page.getByRole('button', { name: '文字色: 黒' }).click();
  await expect(text).not.toHaveClass(/text-orange/);

  await page.getByRole('button', { name: '文字色: 青' }).click();

  await page.waitForTimeout(600);
  await page.reload();
  const after = topic(page, '見出し').locator('.topic-text');
  await expect(after).toHaveClass(/is-bold/);
  await expect(after).toHaveClass(/text-blue/);
});

test('the four statuses stay in sync with the checkbox', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, '作業');
  const box = statusOf(page, '作業');
  await expect(box).toHaveAttribute('title', '未着手');
  await expect(box).not.toBeChecked();

  await chooseStatus(page, '作業', '進行中');
  await expect(box).toHaveAttribute('title', '進行中');
  await expect(box).not.toBeChecked();

  await chooseStatus(page, '作業', '待ち');
  await expect(box).toHaveAttribute('title', '待ち');
  await expect(box).not.toBeChecked();

  await chooseStatus(page, '作業', '完了');
  await expect(box).toHaveAttribute('title', '完了');
  await expect(box).toBeChecked();

  await topic(page, '作業').click();
  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAttribute('title', '未着手');
});

test('clicking the status icon toggles completion', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, 'タスク');
  const box = statusOf(page, 'タスク');

  await box.click();
  await expect(box).toBeChecked();
  await expect(box).toHaveAttribute('title', '完了');

  await box.click();
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAttribute('title', '未着手');
});

test('next-day copy keeps status, memo, link, due date and text style', async ({ page }) => {
  await newMap(page);
  const title = page.getByLabel('マップのタイトル');
  await title.fill('タスク_9月29日');
  await title.press('Enter');

  await page.locator('.topic-root').click();
  await page.keyboard.press('Tab');
  await typeTopic(page, '外注');
  const node = topic(page, '外注');

  await chooseStatus(page, '外注', '待ち');
  await node.click();
  await page.getByRole('button', { name: '太字 (Ctrl+B)' }).click();
  await page.getByRole('button', { name: '文字色: 赤' }).click();

  await openMenu(node);
  await page.getByRole('menuitem', { name: /メモ/ }).click();
  await page.locator('.note-editor').fill('引き継ぎ https://example.com/n');
  await page.keyboard.press('Escape');

  await openMenu(node);
  await page.getByRole('menuitem', { name: /リンク/ }).click();
  await page.getByLabel('リンクURL').fill('example.com/docs');
  await page.getByLabel('リンクURL').press('Enter');

  await openMenu(node);
  await page.getByRole('menuitem', { name: /期日/ }).click();
  await page.getByLabel('期日').fill('2026-10-03');
  await page.locator('.popover-actions').getByRole('button', { name: '閉じる' }).click();

  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card', { hasText: 'タスク_9月29日' }).getByRole('button', { name: '次の日のタスクを作成' }).click();
  await page.locator('.card', { hasText: 'タスク_9月30日' }).locator('.card-body').click();

  const copied = topic(page, '外注');
  await expect(statusOf(page, '外注')).toHaveAttribute('title', '待ち');
  await expect(copied.locator('.topic-text')).toHaveClass(/is-bold/);
  await expect(copied.locator('.topic-text')).toHaveClass(/text-red/);
  await expect(copied.getByLabel('リンクを開く')).toHaveAttribute('href', 'https://example.com/docs');
  await expect(copied.getByLabel(/期日/)).toContainText('10/3');
  await copied.getByLabel('メモを表示').click();
  await expect(page.locator('.note-editor')).toHaveValue(/引き継ぎ/);
});
