import { expect, test } from '@playwright/test';
import { newMap, statusOf, topic, typeTopic } from './helpers';

test('regeneration includes task additions and status changes made after the dialog opened', async ({ page, context }) => {
  await newMap(page);
  const editorUrl = new URL(page.url());
  const mapId = editorUrl.hash.split('/').at(-1)!;

  await page.keyboard.press('Tab');
  await typeTopic(page, 'Report category');
  await page.keyboard.press('Tab');
  await typeTopic(page, 'Existing pending task');
  await page.locator('.toolbar').getByRole('button').first().click();
  await page.locator('.card').first().locator('.card-footer button').first().click();

  const report = page.locator('#daily-report-text');
  const regenerate = page.locator('.daily-report-footer button').first();
  const editor = await context.newPage();
  await editor.goto(`${editorUrl.origin}/#/maps/${mapId}`);
  await expect(topic(editor, 'Existing pending task')).toBeVisible();

  // Add and complete a task while the first page's report dialog stays open.
  await topic(editor, 'Report category').click();
  await editor.getByRole('button', { name: 'Child' }).click();
  await typeTopic(editor, 'Added after opening report');
  await statusOf(editor, 'Added after opening report').click();
  await expect(statusOf(editor, 'Added after opening report')).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(450);

  page.once('dialog', (dialog) => dialog.accept());
  await regenerate.click();
  await expect(report).toHaveValue(/Added after opening report/);
  await expect(page.locator('.daily-report-preview')).toContainText('Added after opening report');

  // A status-only change to an existing task is also picked up on regeneration.
  await statusOf(editor, 'Existing pending task').click();
  await expect(statusOf(editor, 'Existing pending task')).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(450);
  page.once('dialog', (dialog) => dialog.accept());
  await regenerate.click();
  await expect(report).toHaveValue(/Existing pending task/);
  await expect(page.locator('.daily-report-preview')).toContainText('Existing pending task');
  await editor.close();
});
