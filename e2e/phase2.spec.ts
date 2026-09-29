import { expect, test, type Page } from '@playwright/test';
import { chooseStatus, newMap, openMenu, statusOf, topic, typeTopic } from './helpers';

async function expectNoOverlap(page: Page) {
  await expect(async () => {
    const boxes = await page.locator('.react-flow__node').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, t: el.textContent };
      }),
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
        expect(overlap, `"${a.t}" overlaps "${b.t}"`).toBe(false);
      }
  }).toPass({ timeout: 5000 });
}

const LONG_URL_1 = 'LP https://docs.google.com/spreadsheets/d/1lllX9u-1v-Ghba5pZxx2sByMOcomWKghkdDjx0Lzodw/edit?gid=1651466306#gid=1651466306';
const LONG_URL_2 = 'https://grateful-h.backlog.com/view/GRILL_CLEAR_PRO-87#comment-821004809';

test('long text / URL topics never overlap (add, add child, drag)', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, 'ナハト');
  await page.keyboard.press('Tab');
  await typeTopic(page, '10月9日〜みさきグリル');
  await page.keyboard.press('Tab');
  await typeTopic(page, LONG_URL_1);
  await page.keyboard.press('Enter');
  await typeTopic(page, LONG_URL_2);
  await page.keyboard.press('Enter');
  await typeTopic(page, '短い');
  await expectNoOverlap(page);

  // Add children under the long URL topic.
  await topic(page, LONG_URL_1).click();
  for (const t of ['子1', '子2 とても長いテキストとても長いテキストとても長いテキストとても長いテキスト']) {
    await page.keyboard.press('Tab');
    await typeTopic(page, t);
    await topic(page, LONG_URL_1).click();
  }
  await page.locator('.topic-root').click();
  await page.keyboard.press('Tab');
  await typeTopic(page, 'AD');
  await expectNoOverlap(page);

  // Drag the long topic onto AD, layout re-flows without overlaps.
  const src = (await topic(page, LONG_URL_2).boundingBox())!;
  const dst = (await topic(page, 'AD').boundingBox())!;
  await page.mouse.move(src.x + 20, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 15 });
  await page.mouse.up();
  await expectNoOverlap(page);
});

test('title and root topic stay in sync both ways', async ({ page }) => {
  await newMap(page);
  const title = page.getByLabel('マップのタイトル');
  const root = page.locator('.topic-root');

  await title.fill('タスク_9月29日');
  await expect(root).toHaveText('タスク_9月29日'); // live, before committing
  await title.press('Enter');

  await root.dblclick();
  const editor = page.locator('.topic-editor');
  await editor.fill('タスク_10月1日');
  await expect(title).toHaveValue('タスク_10月1日'); // live while editing the root
  await editor.press('Escape');
  await expect(title).toHaveValue('タスク_9月29日'); // cancel reverts both

  await root.dblclick();
  await editor.fill('中央タスク');
  await editor.press('Enter');
  await expect(title).toHaveValue('中央タスク');

  await page.keyboard.press('Control+z');
  await expect(title).toHaveValue('タスク_9月29日');
  await expect(root).toHaveText('タスク_9月29日');

  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await expect(page.locator('.card', { hasText: 'タスク_9月29日' })).toBeVisible();
});

test('context menu: status, memo (with URL) and link are shown, editable and persisted', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab');
  await typeTopic(page, '外注');
  const node = topic(page, '外注');

  // Status (via the context menu)
  await openMenu(node);
  await expect(page.getByRole('menuitem')).toHaveText([/メモ/, /リンク/, /期日/, /ステータス/]);
  await page.getByRole('menuitem', { name: /ステータス/ }).hover();
  await page.getByRole('menuitemradio', { name: /進行中/ }).click();
  await expect(node.locator('.topic-status')).toHaveAttribute('title', '進行中');
  await openMenu(node);
  await page.getByRole('menuitem', { name: /ステータス/ }).click();
  await page.getByRole('menuitemradio', { name: /待ち/ }).click();
  await expect(node.locator('.topic-status')).toHaveAttribute('title', '待ち');

  // Memo: no icon until a memo exists.
  await expect(node.getByLabel('メモを表示')).toHaveCount(0);
  await openMenu(node);
  await page.getByRole('menuitem', { name: /メモ/ }).click();
  const memo = page.locator('.note-editor');
  await expect(memo).toBeFocused();
  // Space / Delete inside the memo must not affect the topic.
  await memo.pressSequentially('お疲れ様です。 ');
  await memo.press('Delete');
  await memo.fill('お疲れ様です。\n確認用 https://example.com/sheet?id=1\nよろしくお願いします。');
  await expect(statusOf(page, '外注')).not.toBeChecked();
  const icon = node.getByLabel('メモを表示');
  await expect(icon).toBeVisible(); // auto-saved
  await expect(page.locator('.note-links').getByRole('link', { name: /example\.com\/sheet/ })).toHaveAttribute(
    'href',
    'https://example.com/sheet?id=1',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.popover')).toHaveCount(0);

  await icon.click();
  await expect(page.locator('.note-editor')).toHaveValue(/お疲れ様です。/);
  await page.locator('.note-editor').fill('更新したメモ');
  await page.keyboard.press('Escape');
  await expect(page.locator('.popover')).toHaveCount(0);

  // Link
  await openMenu(node);
  await page.getByRole('menuitem', { name: /リンク/ }).click();
  await page.getByLabel('リンクURL').fill('example.com/docs');
  await page.getByLabel('リンクURL').press('Enter');
  await expect(node.getByLabel('リンクを開く')).toHaveAttribute('href', 'https://example.com/docs');

  // Undo removes the link, redo restores it.
  await page.keyboard.press('Control+z');
  await expect(node.getByLabel('リンクを開く')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(node.getByLabel('リンクを開く')).toHaveCount(1);

  // Persisted after reload.
  await page.waitForTimeout(600);
  await page.reload();
  const reloaded = topic(page, '外注');
  await expect(reloaded.locator('.topic-status')).toHaveAttribute('title', '待ち');
  await expect(reloaded.getByLabel('リンクを開く')).toHaveAttribute('href', 'https://example.com/docs');
  await reloaded.getByLabel('メモを表示').click();
  await expect(page.locator('.note-editor')).toHaveValue('更新したメモ');
});

test('create the next day map carrying over unfinished main topics', async ({ page }) => {
  await newMap(page);
  const title = page.getByLabel('マップのタイトル');
  await title.fill('タスク_9月29日');
  await title.press('Enter');
  const root = page.locator('.topic-root');

  await root.click();
  await page.keyboard.press('Tab');
  await typeTopic(page, '外注');
  await page.keyboard.press('Tab');
  await typeTopic(page, 'A');
  await page.keyboard.press('Enter');
  await typeTopic(page, 'B');
  await page.keyboard.press('Enter');
  await typeTopic(page, 'C');
  await chooseStatus(page, 'A', '完了');
  await chooseStatus(page, 'C', '完了');

  await root.click();
  await page.keyboard.press('Tab');
  await typeTopic(page, '完了');
  await page.keyboard.press('Tab');
  await typeTopic(page, 'D');
  await chooseStatus(page, '完了', '完了');
  await expect(statusOf(page, '完了')).toBeChecked();

  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card', { hasText: 'タスク_9月29日' }).getByRole('button', { name: '次の日のタスクを作成' }).click();
  const nextCard = page.locator('.card', { hasText: 'タスク_9月30日' });
  await expect(nextCard).toBeVisible();

  // The new map: title = root = next day; only the unfinished subtree, with child states kept.
  await nextCard.locator('.card-body').click();
  await expect(page.getByLabel('マップのタイトル')).toHaveValue('タスク_9月30日');
  await expect(page.locator('.topic-root')).toHaveText('タスク_9月30日');
  await expect(statusOf(page, '外注')).not.toBeChecked();
  await expect(statusOf(page, 'A')).toBeChecked();
  await expect(statusOf(page, 'B')).not.toBeChecked();
  await expect(statusOf(page, 'C')).toBeChecked();
  await expect(topic(page, '完了')).toHaveCount(0);
  await expect(topic(page, 'D')).toHaveCount(0);

  // The source map is unchanged.
  await page.getByRole('button', { name: '← 一覧' }).click();
  await page.locator('.card', { hasText: 'タスク_9月29日' }).locator('.card-body').click();
  await expect(topic(page, '完了')).toBeVisible();
  await expect(topic(page, 'D')).toBeVisible();
  await expect(topic(page, '外注')).toBeVisible();
});
