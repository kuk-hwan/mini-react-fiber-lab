import { test, expect } from '@playwright/test';

test('Mini React screen reaches real cache and indexed SQL API', async ({ page }, testInfo) => {
  await page.goto('/#systems');
  await expect(page.getByRole('heading', { name: '화면에서 저장소까지' })).toBeVisible();
  await page.getByLabel('샘플 플레이어 이름').fill('실험 플레이어');
  await page.getByRole('button', { name: '샘플 기록 저장', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText('INVALIDATED');
  await page.getByRole('button', { name: '캐시로 조회', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText(/MISS|HIT/);
  await expect(page.getByRole('button', { name: '캐시로 조회', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '캐시로 조회', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText('HIT');
  if (process.env.UPDATE_SCREENSHOTS && testInfo.project.name === 'chromium') {
    await page.screenshot({ path: 'docs/images/systems-cache.png', fullPage: true });
  }
  await page.getByRole('button', { name: '캐시 없이 조회', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText('BYPASS');
  await page.getByRole('button', { name: 'SQL 실행', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText('B+TREE');
  await expect(page.locator('#systems-response')).toContainText('index_nodes_visited');
  if (process.env.UPDATE_SCREENSHOTS && testInfo.project.name === 'chromium') {
    await page.screenshot({ path: 'docs/images/systems-sql.png', fullPage: true });
  }
  await page.getByRole('button', { name: '이름 검색 예시', exact: true }).click();
  await page.getByRole('button', { name: 'SQL 실행', exact: true }).click();
  await expect(page.locator('#systems-status')).toContainText('FULL_SCAN');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('Redis expiry and deletion are visible without refreshing', async ({ page }) => {
  await page.goto('/#systems');
  await page.getByLabel('Key', { exact: true }).fill(`ttl-${Date.now()}`);
  await page.getByLabel('TTL (초)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'SET', exact: true }).click();
  await expect(page.locator('#systems-response')).toContainText('"stored": true');
  await page.getByRole('button', { name: 'GET', exact: true }).click();
  await expect(page.locator('#systems-response')).toContainText('"found": false');
  await page.getByLabel('TTL (초)', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'SET', exact: true }).click();
  await expect(page.locator('#systems-response')).toContainText('"stored": true');
  await page.getByRole('button', { name: 'GET', exact: true }).click();
  await expect(page.locator('#systems-response')).toContainText('"found": true');
  await page.getByRole('button', { name: 'DEL', exact: true }).click();
  await expect(page.locator('#systems-response')).toContainText('"deleted": true');
});

test('card game saves the current real attempt count to the DBMS', async ({ page }) => {
  await page.goto('/#game');
  await expect(page.locator('.memory-card')).toHaveCount(16);
  await page.locator('.memory-card').nth(0).click();
  await page.locator('.memory-card').nth(1).click();
  await expect(page.locator('#game-attempts')).toHaveText('시도 1회');
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/scores') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '현재 기록 저장', exact: true }).click();
  const response = await responsePromise;
  const payload = await response.json();
  expect(payload.row.attempts).toBe(1);
  await expect(page.locator('.memory-save-status')).toContainText('저장 완료');
});
