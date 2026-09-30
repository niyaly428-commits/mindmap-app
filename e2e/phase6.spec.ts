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
