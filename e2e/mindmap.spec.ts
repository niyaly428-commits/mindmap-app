import { expect, test } from '@playwright/test';
import { chooseStatus, statusOf, topic, typeTopic } from './helpers';

test('create, edit, check, undo, persist, rename and delete a map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ 新規作成' }).click();
  await expect(page).toHaveURL(/#\/maps\//);
  await expect(page.locator('.topic-root')).toBeVisible();

  // Root is selected: Tab adds a main topic, then sub topics.
  await page.keyboard.press('Tab');
  await typeTopic(page, 'メイン1');
  await page.keyboard.press('Tab');
  await typeTopic(page, 'サブ1');
  await page.keyboard.press('Enter');
  await typeTopic(page, 'サブ2');

  // Space toggles the selected topic; all children checked -> parent checked.
  await page.keyboard.press('Space');
  const check = (t: string) => statusOf(page, t);
  await expect(check('サブ2')).toBeChecked();
  await expect(check('メイン1')).not.toBeChecked();
  await chooseStatus(page, 'サブ1', '完了');
  await expect(check('メイン1')).toBeChecked();

  // Un-completing the parent un-completes all children.
  await chooseStatus(page, 'メイン1', '未着手');
  await expect(check('サブ1')).not.toBeChecked();
  await expect(check('サブ2')).not.toBeChecked();

  // Delete + undo/redo.
  await topic(page, 'サブ2').click();
  await page.keyboard.press('Delete');
  await expect(topic(page, 'サブ2')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(topic(page, 'サブ2')).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(topic(page, 'サブ2')).toHaveCount(0);
  await page.keyboard.press('Control+z');

  // Double click edits text.
  await topic(page, 'サブ2').dblclick();
  await typeTopic(page, 'サブ2改');

  // Title edit.
  const title = page.getByLabel('マップのタイトル');
  await title.fill('旅行計画');
  await title.press('Enter');

  // Persisted after reload.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(topic(page, 'サブ2改')).toBeVisible();
  await expect(topic(page, 'メイン1')).toBeVisible();
  await expect(page.getByLabel('マップのタイトル')).toHaveValue('旅行計画');

  // List page: card, rename, delete.
  await page.getByRole('button', { name: '← 一覧' }).click();
  const card = page.locator('.card', { hasText: '旅行計画' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '名前変更' }).click();
  await page.locator('.card-title-input').fill('旅行計画2');
  await page.locator('.card-title-input').press('Enter');
  const renamed = page.locator('.card', { hasText: '旅行計画2' });
  await expect(renamed).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await renamed.getByRole('button', { name: '削除' }).click();
  await expect(renamed).toHaveCount(0);
});

test('drag a topic onto another topic to re-parent it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ 新規作成' }).click();
  await expect(page.locator('.topic-root')).toBeVisible();
  await page.keyboard.press('Tab');
  await typeTopic(page, 'A');
  await page.keyboard.press('Tab');
  await typeTopic(page, 'A1');
  await page.locator('.topic-root').click();
  await page.keyboard.press('Tab');
  await typeTopic(page, 'B');

  const a1 = await topic(page, 'A1').boundingBox();
  const b = await topic(page, 'B').boundingBox();
  await page.mouse.move(a1!.x + a1!.width / 2, a1!.y + a1!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 15 });
  await expect(topic(page, 'B')).toHaveClass(/is-drop-target/);
  await page.mouse.up();

  // A1 is now laid out on B's side (left), i.e. left of the root.
  const root = await page.locator('.topic-root').boundingBox();
  await expect(async () => {
    const moved = await topic(page, 'A1').boundingBox();
    expect(moved!.x + moved!.width).toBeLessThan(root!.x);
  }).toPass();

  // Undo restores the original parent (right side).
  await page.keyboard.press('Control+z');
  await expect(async () => {
    const back = await topic(page, 'A1').boundingBox();
    expect(back!.x).toBeGreaterThan(root!.x + root!.width);
  }).toPass();
});
