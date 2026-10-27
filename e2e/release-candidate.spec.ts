import { expect, test } from '@playwright/test';
import { newMap, topic, typeTopic } from './helpers';

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
