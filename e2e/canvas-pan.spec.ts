import { expect, test } from '@playwright/test';
import { newMap, typeTopic } from './helpers';

test('blank left-drag pans the canvas horizontally while node dragging still moves the node', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, 'Pan test topic');
  // The first child is the only non-root topic; use its rendered node directly.
  const child = page.locator('.react-flow__node[data-id]').filter({ hasNot: page.locator('.topic-root') }).first();
  await expect(child).toBeVisible();
  const beforePan = await child.boundingBox();
  const pane = page.locator('.react-flow__pane');
  const paneBox = await pane.boundingBox();
  const startX = paneBox!.x + 35;
  const startY = paneBox!.y + paneBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 180, startY + 30, { steps: 10 });
  await page.mouse.up();
  const afterPan = await child.boundingBox();
  expect(afterPan!.x).toBeLessThan(beforePan!.x - 100);
  expect(afterPan!.y).toBeGreaterThan(beforePan!.y + 10);

  const beforeNodeDrag = await child.boundingBox();
  await page.mouse.move(beforeNodeDrag!.x + beforeNodeDrag!.width / 2, beforeNodeDrag!.y + beforeNodeDrag!.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeNodeDrag!.x + beforeNodeDrag!.width / 2 + 100, beforeNodeDrag!.y + beforeNodeDrag!.height / 2, { steps: 8 });
  await page.mouse.up();
  const afterNodeDrag = await child.boundingBox();
  expect(afterNodeDrag!.x).toBeGreaterThan(beforeNodeDrag!.x + 60);
});
