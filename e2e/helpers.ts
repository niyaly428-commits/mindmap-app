import { expect, type Locator, type Page } from '@playwright/test';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A topic box whose task name is exactly `text` (ignores badges like the due date). */
export const topic = (page: Page, text: string): Locator =>
  page.locator('.topic').filter({ has: page.locator('span.topic-text', { hasText: new RegExp(`^${escape(text)}$`) }) });

export async function typeTopic(page: Page, text: string) {
  const editor = page.locator('.topic-editor');
  await expect(editor).toBeFocused();
  await editor.fill(text);
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
}

export async function newMap(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ 新規作成' }).click();
  await expect(page.locator('.topic-root')).toBeVisible();
}

/** The status control (also the completion checkbox: checked = 完了). */
export const statusOf = (page: Page, text: string) => topic(page, text).getByRole('checkbox');

/** Clicks the status icon and picks one of 未着手 / 進行中 / 待ち / 完了. */
export async function chooseStatus(page: Page, text: string, label: string) {
  await statusOf(page, text).hover();
  const picker = page.getByRole('menu', { name: 'ステータスを選択' });
  await expect(picker).toBeVisible();
  await picker.getByRole('menuitemradio', { name: label }).click();
  await expect(picker).toHaveCount(0);
}

export async function openMenu(node: Locator) {
  await node.click({ button: 'right' });
  await expect(node.page().getByRole('menu').first()).toBeVisible();
}
