import { test, expect } from '@playwright/test';

test('DOM editing, history navigation, no-op and keyed reordering', async ({ page }) => {
  await page.goto('/');
  const original = await page.locator('#actual h2').elementHandle();
  await page.getByLabel('실험 예제', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await expect(page.locator('#actual h2')).toHaveText('오늘도, 한 단계 성장.');
  expect(await original!.evaluate((node) => node === document.querySelector('#actual h2'))).toBe(
    true,
  );
  await expect(page.locator('#metric-changes')).toHaveText('1operations');
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page.locator('#actual h2')).toHaveText('조금씩, 더 나은 코드.');
  await page.getByRole('button', { name: '앞으로가기', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue(/오늘도, 한 단계 성장/);
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  await expect(page.locator('#metric-changes')).toHaveText('0operations');
  const first = await page.locator('#actual [data-key="vdom"]').elementHandle();
  await page.getByLabel('실험 예제', { exact: true }).selectOption('reorder');
  await page.getByRole('button', { name: 'Patch 적용' }).click();
  expect(
    await first!.evaluate((node) => node === document.querySelector('#actual [data-key="vdom"]')),
  ).toBe(true);
  await expect(page.locator('#actual li').first()).toHaveAttribute('data-key', 'patch');
});

test('task board events, memo reuse, batching and persistence', async ({ page }) => {
  await page.goto('/#hooks');
  await expect(page.locator('#fiber-stats')).toContainText('COMMITS');
  await page.getByLabel('새 작업', { exact: true }).fill('E2E task');
  await expect(page.getByLabel('새 작업', { exact: true })).toHaveValue('E2E task');
  await page.getByRole('button', { name: '+ 추가', exact: true }).click();
  await expect(page.locator('.task-title').filter({ hasText: 'E2E task' })).toBeVisible();
  await page.getByLabel('작업 검색', { exact: true }).fill('E2E');
  await expect(page.locator('.task-row')).toHaveCount(1);
  const commits = Number(
    await page.locator('#fiber-stats > div').first().locator('strong').textContent(),
  );
  await page.getByRole('button', { name: '+3 한 번에', exact: true }).click();
  await expect(page.locator('#batch-value')).toHaveText('3');
  await expect(page.locator('#fiber-stats > div').first().locator('strong')).toHaveText(
    String(commits + 1),
  );
  await page.reload();
  await expect(page.locator('.task-title').filter({ hasText: 'E2E task' })).toBeVisible();
});

test('responsive layout, keyboard patch and no application errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('테스트 HTML 소스', { exact: true }).fill('<p>Keyboard patch</p>');
  await page.getByLabel('테스트 HTML 소스', { exact: true }).press('Control+Enter');
  await expect(page.locator('#actual')).toHaveText('Keyboard patch');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/#guide');
  await expect(page.getByRole('heading', { name: '화면 뒤에서 일어나는 일.' })).toBeVisible();
  expect(errors).toEqual([]);
});
