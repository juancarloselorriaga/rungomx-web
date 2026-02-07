import { expect, test } from '@playwright/test';

test.describe('Public Results + Rankings', () => {
  test('results page supports official search flow', async ({ page }) => {
    await page.goto('/en/results');
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Find official results' })).toBeVisible();

    await page.getByLabel('Runner name').fill('zzzz-runner-not-found');
    await page.getByLabel('Bib').fill('999999');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/en\/results\?/);
    await expect(page).toHaveURL(/q=zzzz-runner-not-found/);
    await expect(page).toHaveURL(/bib=999999/);
    await expect(page.getByRole('heading', { name: 'Search matches' })).toBeVisible();

    const emptyMatches = page.getByText('No official matches found for this search.');
    const openOfficialLink = page.getByRole('link', { name: 'Open official page' }).first();
    if (await emptyMatches.isVisible().catch(() => false)) {
      await expect(emptyMatches).toBeVisible();
    } else {
      await expect(openOfficialLink).toBeVisible();
    }
  });

  test('rankings page applies scope filter via URL', async ({ page }) => {
    await page.goto('/en/rankings');
    await expect(page.getByRole('heading', { name: 'National Rankings' })).toBeVisible();
    await expect(page.getByLabel('Scope')).toBeVisible();
    await expect(page.getByLabel('Organizer')).toBeVisible();

    await page.getByLabel('Scope').selectOption('organizer');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(/\/en\/rankings\?/);
    await expect(page).toHaveURL(/scope=organizer/);

    const noSnapshot = page.getByText('No promoted national snapshot is available yet.');
    const reproducibility = page.getByText('Reproducibility context');
    const noRows = page.getByText('No ranking rows are available yet.');
    const noMatch = page.getByText('No ranking rows match the selected filters.');
    const leaderboard = page.getByRole('heading', { name: 'National leaderboard' });

    const hasKnownState =
      await noSnapshot.isVisible().catch(() => false) ||
      await reproducibility.isVisible().catch(() => false) ||
      await noRows.isVisible().catch(() => false) ||
      await noMatch.isVisible().catch(() => false) ||
      await leaderboard.isVisible().catch(() => false);

    expect(hasKnownState).toBe(true);
  });
});
