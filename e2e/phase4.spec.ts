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

test('the three presets change node and connector structure while themes stay independent', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Design branch');
  const node = topic(page, 'Design branch');
  const organicPath = await page.locator('.react-flow__edge path').first().getAttribute('d');
  await page.getByLabel('Design preset').selectOption('clean-structured');
  await expect(page.locator('.react-flow__edge path').first()).not.toHaveAttribute('d', organicPath!);
  await expect(node).toHaveCSS('border-radius', '4px');
  await expect(page.getByLabel('Color theme')).toHaveValue('calm-blue');
  await page.getByLabel('Design preset').selectOption('soft-analytical');
  await expect(node.locator('.topic-section-number')).toHaveText('1');
  await expect(page.getByLabel('Color theme')).toHaveValue('calm-blue');
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
  const imageBox = await page.locator('.image-lightbox img').boundingBox();
  expect(imageBox!.x).toBeGreaterThanOrEqual(0); expect(imageBox!.y).toBeGreaterThanOrEqual(0);
  expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(1400); expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(900);
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
  await page.keyboard.down('Shift'); await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift');
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
  await expect(b).toHaveClass(/is-routine/);
  await page.keyboard.press('Control+z');
  await expect(a).not.toHaveClass(/is-routine/); await expect(b).not.toHaveClass(/is-routine/);
  await page.keyboard.press('Control+y');
  await expect(a).toHaveClass(/is-routine/); await expect(b).toHaveClass(/is-routine/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '一括削除' }).click();
  await expect(topic(page, 'Bulk A')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(topic(page, 'Bulk A')).toBeVisible();
});

test('PDF output opens a print-ready landscape document with the map hierarchy', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'PDF child');
  await page.getByLabel('Design preset').selectOption('clean-structured');
  await page.getByLabel('Color theme').selectOption('elegant');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'PDF出力' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('h1')).toContainText('無題のマインドマップ');
  await expect(popup.locator('body')).toContainText('PDF child');
  await expect(popup.locator('.mindmap-connectors path')).toHaveCount(1);
  await expect(popup.locator('.mindmap-connectors path')).toHaveAttribute('d', /H/);
  await expect(popup.locator('.mindmap-node')).toHaveCount(2);
  await expect(popup.locator('.mindmap-sheet')).toHaveCSS('background-color', 'rgb(246, 248, 251)');
  await expect(popup.getByRole('button', { name: 'PDFとして保存' })).toBeVisible();
});

test('long maps keep all nodes and receive readable branch detail sheets', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Section 1');
  for (let index = 2; index <= 24; index++) {
    await page.keyboard.press('Enter'); await typeTopic(page, `Section ${index}`);
  }
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'PDF出力' }).click();
  const popup = await popupPromise;
  expect(await popup.locator('.mindmap-sheet').count()).toBeGreaterThan(1);
  await expect(popup.locator('.mindmap-sheet').first().locator('.mindmap-node')).toHaveCount(25);
  await expect(popup.locator('.mindmap-sheet').first().locator('.mindmap-connectors path')).toHaveCount(24);
  expect(await popup.locator('.mindmap-node[data-node-id]').evaluateAll((els) => new Set(els.map((el) => el.getAttribute('data-node-id'))).size)).toBe(25);
});

test('oversized image preview fits the viewport without changing aspect ratio', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Wide image');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="#5690db"/></svg>');
  await page.getByLabel('画像追加').setInputFiles({ name: 'wide.svg', mimeType: 'image/svg+xml', buffer: svg });
  await topic(page, 'Wide image').getByRole('button', { name: '画像を拡大' }).click();
  const image = page.locator('.image-lightbox img');
  await expect(image).toBeVisible();
  const result = await image.evaluate((el: HTMLImageElement) => ({ naturalRatio: el.naturalWidth / el.naturalHeight, rect: el.getBoundingClientRect().toJSON() }));
  expect(result.naturalRatio).toBe(2);
  expect(result.rect.width).toBeLessThanOrEqual(1352); expect(result.rect.height).toBeLessThanOrEqual(852);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('dialog', { name: '画像プレビュー' })).toHaveCount(0);
});

test('right click keeps a rectangle selection and routine toggles every selected task', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Context A');
  await page.keyboard.press('Enter'); await typeTopic(page, 'Context B');
  const a = topic(page, 'Context A'); const b = topic(page, 'Context B');
  const ar = await a.boundingBox(); const br = await b.boundingBox();
  const left = Math.min(ar!.x, br!.x) - 15; const top = Math.min(ar!.y, br!.y) - 15;
  const right = Math.max(ar!.x + ar!.width, br!.x + br!.width) + 15; const bottom = Math.max(ar!.y + ar!.height, br!.y + br!.height) + 15;
  await page.keyboard.down('Shift'); await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift');
  await a.click({ button: 'right' });
  await expect(page.getByText('2件選択')).toBeVisible();
  await page.locator('.menu-sub > button').click();
  const statuses = page.locator('.submenu [role="menuitemradio"]');
  await statuses.nth(2).click();
  await expect(a.locator('.topic-status .status-icon')).toHaveClass(/status-waiting/);
  await expect(b.locator('.topic-status .status-icon')).toHaveClass(/status-waiting/);
  await page.keyboard.press('Control+z');
  await expect(a.locator('.topic-status .status-icon')).toHaveClass(/status-todo/);
  await expect(b.locator('.topic-status .status-icon')).toHaveClass(/status-todo/);
  await page.keyboard.press('Control+y');
  await expect(a.locator('.topic-status .status-icon')).toHaveClass(/status-waiting/);
  await expect(b.locator('.topic-status .status-icon')).toHaveClass(/status-waiting/);
  await a.click({ button: 'right' });
  await page.getByRole('menuitemcheckbox').click();
  await expect(a).toHaveClass(/is-routine/); await expect(b).toHaveClass(/is-routine/);
  await page.keyboard.press('Control+z');
  await expect(a).not.toHaveClass(/is-routine/); await expect(b).not.toHaveClass(/is-routine/);
  await page.keyboard.press('Control+y');
  await expect(a).toHaveClass(/is-routine/); await expect(b).toHaveClass(/is-routine/);
});

test('structured presets route deep sibling connectors through readable orthogonal buses', async ({ page }) => {
  await newMap(page);
  await page.locator('.topic-root').click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Route parent');
  const parent = topic(page, 'Route parent');
  await parent.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Child 0');
  for (let i = 1; i < 5; i++) { await page.keyboard.press('Enter'); await typeTopic(page, `Child ${i}`); }
  for (let i = 0; i < 5; i++) {
    await topic(page, `Child ${i}`).click(); await page.keyboard.press('Tab'); await typeTopic(page, `Leaf ${i}-0`);
    await page.keyboard.press('Enter'); await typeTopic(page, `Leaf ${i}-1`);
  }

  for (const preset of ['clean-structured', 'soft-analytical'] as const) {
    await page.getByLabel('Design preset').selectOption(preset);
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(16);
    const routes = await edges.evaluateAll((elements) => elements.map((element) => {
      const path = element.querySelector('path')!.getAttribute('d')!;
      const moves = [...path.matchAll(/M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/g)];
      return { source: element.querySelector('g[data-route-parent-id]')?.getAttribute('data-route-parent-id'), path, branchY: moves.length ? Number(moves[moves.length - 1][2]) : null };
    }));
    expect(routes.every((route) => route.branchY !== null && /^[\dMHV]+$/.test(route.path.replace(/[\d.,\s-]/g, ''))), `${preset} edges use orthogonal routes`).toBe(true);
    const byParent = new Map<string, number[]>();
    for (const route of routes) {
      const lanes = byParent.get(route.source!) ?? [];
      lanes.push(route.branchY!); byParent.set(route.source!, lanes);
    }
    for (const branches of byParent.values()) if (branches.length > 1) expect(new Set(branches).size).toBe(branches.length);
  }
});

test('dragging a task moves it, reparenting updates its connector, and pane selection remains separate', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Parent A');
  await page.keyboard.press('Enter'); await typeTopic(page, 'Parent B');
  const a = topic(page, 'Parent A'); const b = topic(page, 'Parent B');
  await a.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Movable child');
  const child = topic(page, 'Movable child');
  const from = await child.boundingBox(); const to = await b.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down(); await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => page.locator('.react-flow__edge').count()).toBe(3);
  const moved = await child.boundingBox(); expect(moved!.x).not.toBe(from!.x);
  const movedParent = await b.boundingBox(); expect(Math.abs((moved!.y + moved!.height / 2) - (movedParent!.y + movedParent!.height / 2))).toBeLessThan(10);
  expect(moved!.x + moved!.width <= movedParent!.x || movedParent!.x + movedParent!.width <= moved!.x).toBe(true);
  await page.waitForTimeout(450); await page.reload();
  const persisted = await topic(page, 'Movable child').boundingBox();
  const persistedParent = await topic(page, 'Parent B').boundingBox();
  expect(persisted!.x + persisted!.width <= persistedParent!.x || persistedParent!.x + persistedParent!.width <= persisted!.x).toBe(true);
  const aBox = await topic(page, 'Parent A').boundingBox(); const bBox = await topic(page, 'Parent B').boundingBox(); const childBox = await topic(page, 'Movable child').boundingBox();
  const left = Math.min(aBox!.x, bBox!.x, childBox!.x) - 12; const top = Math.min(aBox!.y, bBox!.y, childBox!.y) - 12;
  const right = Math.max(aBox!.x + aBox!.width, bBox!.x + bBox!.width, childBox!.x + childBox!.width) + 12;
  const bottom = Math.max(aBox!.y + aBox!.height, bBox!.y + bBox!.height, childBox!.y + childBox!.height) + 12;
  await page.keyboard.down('Shift'); await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift');
  await expect(page.getByText('3件選択')).toBeVisible();
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

test('bulk due dates update every selected topic and undo/redo as one edit', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Bulk due A');
  await page.keyboard.press('Enter'); await typeTopic(page, 'Bulk due B');
  const a = topic(page, 'Bulk due A'); const b = topic(page, 'Bulk due B');
  const ar = await a.boundingBox(); const br = await b.boundingBox();
  const left = Math.min(ar!.x, br!.x) - 15; const top = Math.min(ar!.y, br!.y) - 15;
  const right = Math.max(ar!.x + ar!.width, br!.x + br!.width) + 15; const bottom = Math.max(ar!.y + ar!.height, br!.y + br!.height) + 15;
  await page.keyboard.down('Shift'); await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(right, bottom, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift');
  await a.click({ button: 'right' });
  await page.locator('.context-menu[role="menu"] > .menu-item').nth(2).click();
  const dueDate = await page.evaluate(() => {
    const date = new Date(); date.setDate(date.getDate() + 5);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  await page.locator('input[type="date"]').fill(dueDate);
  await expect(a).toHaveClass(/due-soon/); await expect(b).toHaveClass(/due-soon/);
  await expect(page.getByText('2件選択')).toBeVisible();
  await page.locator('.popover-close').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(a).not.toHaveClass(/has-due/); await expect(b).not.toHaveClass(/has-due/);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(a).toHaveClass(/due-soon/); await expect(b).toHaveClass(/due-soon/);
});

test('wheel pans vertically and Control plus wheel changes zoom', async ({ page }) => {
  await newMap(page);
  const viewport = page.locator('.react-flow__viewport');
  const read = () => viewport.evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
  });
  const before = await read();
  await page.mouse.move(1300, 840);
  await page.mouse.wheel(0, 180);
  await expect.poll(async () => (await read()).y).not.toBe(before.y);
  const panned = await read();
  expect(panned.scale).toBeCloseTo(before.scale, 5);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await read()).scale).not.toBeCloseTo(panned.scale, 4);
});

test('root branches distribute onto both sides as the map grows', async ({ page }) => {
  await newMap(page);
  const root = page.locator('.topic-root');
  for (let index = 0; index < 8; index++) {
    await root.click(); await page.keyboard.press('Tab'); await typeTopic(page, `Balanced ${index}`);
  }
  const rootBox = await root.boundingBox();
  const sides = await page.locator('.topic-main').evaluateAll((nodes, center) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return rect.x + rect.width / 2 < center ? 'left' : 'right';
  }), rootBox!.x + rootBox!.width / 2);
  expect(sides).toContain('left'); expect(sides).toContain('right');
  expect(Math.abs(sides.filter((side) => side === 'left').length - sides.filter((side) => side === 'right').length)).toBeLessThanOrEqual(1);
});

test('root sibling creation chooses the lighter measured branch in every preset', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Right branch');
  const root = page.locator('.topic-root');
  await root.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Left branch');
  const left = topic(page, 'Left branch');
  await left.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Left child 0');
  for (let index = 1; index < 7; index++) {
    await page.keyboard.press('Enter'); await typeTopic(page, `Left child ${index}`);
  }

  for (const preset of ['soft-organic', 'clean-structured', 'soft-analytical'] as const) {
    await page.getByLabel('Design preset').selectOption(preset);
    await left.click(); await page.keyboard.press('Enter'); await typeTopic(page, `New branch ${preset}`);
    const rootBox = await root.boundingBox();
    const added = await topic(page, `New branch ${preset}`).boundingBox();
    expect(added!.x + added!.width / 2).toBeGreaterThan(rootBox!.x + rootBox!.width / 2);
    const overlaps = await page.locator('.react-flow__node[data-id]').evaluateAll((nodes) => {
      const boxes = nodes.map((node) => node.getBoundingClientRect());
      const collisions: number[][] = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].left < boxes[j].right && boxes[j].left < boxes[i].right && boxes[i].top < boxes[j].bottom && boxes[j].top < boxes[i].bottom) collisions.push([i, j]);
      }
      return collisions;
    });
    expect(overlaps).toEqual([]);
    await page.keyboard.press('Control+z');
    await expect(topic(page, `New branch ${preset}`)).toHaveCount(0);
  }
});

test('dragging a child to the left keeps its parent on the right and turns its descendants left', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Stable parent');
  const parent = topic(page, 'Stable parent');
  await parent.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Moved child');
  const child = topic(page, 'Moved child');
  await child.click(); await page.keyboard.press('Tab'); await typeTopic(page, 'Moved grandchild');
  const root = page.locator('.topic-root');
  const beforeRoot = await root.boundingBox(); const beforeParent = await parent.boundingBox();
  const from = await child.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down(); await page.mouse.move(120, 760, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => {
    const moved = await child.boundingBox();
    return moved ? moved.x : null;
  }).toBeLessThan(from!.x);
  await page.waitForTimeout(450); await page.reload();
  const rootBox = await root.boundingBox(); const parentBox = await parent.boundingBox();
  const childBox = await child.boundingBox(); const grandchildBox = await topic(page, 'Moved grandchild').boundingBox();
  expect(parentBox!.x).toBeGreaterThan(rootBox!.x + rootBox!.width);
  expect(childBox!.x + childBox!.width).toBeLessThan(parentBox!.x);
  expect(grandchildBox!.x + grandchildBox!.width).toBeLessThan(childBox!.x);
  expect(beforeParent!.x).toBeGreaterThan(beforeRoot!.x);
});

test('due date classes use the right urgency color, with dates beyond 30 days neutral', async ({ page }) => {
  await newMap(page);
  await page.keyboard.press('Tab'); await typeTopic(page, 'Color due date');
  const node = topic(page, 'Color due date');
  const dateFor = (days: number) => page.evaluate((offset) => {
    const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, days);
  const setDate = async (days: number) => {
    await node.click(); await page.keyboard.press('Control+d');
    await page.locator('input[type="date"]').fill(await dateFor(days));
    await page.locator('.popover-close').click();
  };
  await setDate(8);
  expect(await node.evaluate((el) => getComputedStyle(el).getPropertyValue('--due-color').trim())).toBe('#4387c8');
  await expect(node).toHaveClass(/due-month/);
  await setDate(31);
  await expect(node).toHaveClass(/due-upcoming/);
  await expect(node).not.toHaveClass(/has-due/);
  expect(await node.evaluate((el) => getComputedStyle(el).getPropertyValue('--due-color').trim())).not.toBe('#e5484d');
  await setDate(150);
  await expect(node).toHaveClass(/due-upcoming/);
  await expect(node).not.toHaveClass(/has-due/);
});
