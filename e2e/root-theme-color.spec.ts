import { expect, test } from '@playwright/test';
import { newMap, typeTopic } from './helpers';

test('root color follows every theme and preset, and its individual text color persists', async ({ page }) => {
  await newMap(page);
  const root = page.locator('.topic-root');
  const themes = ['calm-blue', 'natural', 'elegant', 'fresh', 'monochrome'];
  const presets = ['soft-organic', 'clean-structured', 'soft-analytical'];

  for (const preset of presets) {
    await page.getByLabel('Design preset').selectOption(preset);
    const backgrounds = new Set<string>();
    await page.getByLabel('Color theme').selectOption(themes[0]);
    let background = await root.evaluate((node) => getComputedStyle(node).background);
    backgrounds.add(background);
    for (const theme of themes.slice(1)) {
      await page.getByLabel('Color theme').selectOption(theme);
      await expect.poll(() => root.evaluate((node) => getComputedStyle(node).background)).not.toBe(background);
      background = await root.evaluate((node) => getComputedStyle(node).background);
      backgrounds.add(background);
    }
    expect(backgrounds.size).toBe(themes.length);
  }

  await root.click();
  await page.locator('.text-style-group .color-btn').nth(1).click();
  await expect(root.locator('.topic-text')).toHaveCSS('color', 'rgb(224, 49, 49)');
  await page.waitForTimeout(450);
  await page.reload();
  const reloadedRoot = page.locator('.topic-root');
  await expect(reloadedRoot.locator('.topic-text')).toHaveCSS('color', 'rgb(224, 49, 49)');

  await reloadedRoot.click();
  await page.keyboard.press('Tab');
  await typeTopic(page, 'Theme color child');
  const child = page.locator('.react-flow__node[data-id]').filter({ has: page.locator('.topic-main', { hasText: 'Theme color child' }) });
  await child.click();
  await page.locator('.text-style-group .color-btn').nth(2).click();
  await expect(child.locator('.topic-text')).toHaveCSS('color', 'rgb(28, 100, 214)');
});
