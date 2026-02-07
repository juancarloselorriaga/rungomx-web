import { expect, test } from '@playwright/test';

test.describe('Public Results + Rankings', () => {
  test('results page supports official search flow', async ({ page }) => {
    await page.goto('/en/results');
    await expect(page.getByRole('heading', { name: 'Results', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Find official results', level: 2 })).toBeVisible();

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
    const scopeSelect = page.getByRole('combobox', { name: /^Scope$/ });
    const organizerSelect = page.getByRole('combobox', { name: /^Organizer$/ });
    await expect(page.getByRole('heading', { name: 'National Rankings', level: 1 })).toBeVisible();
    await expect(scopeSelect).toBeVisible();
    await expect(organizerSelect).toBeVisible();

    await scopeSelect.selectOption('organizer');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(/\/en\/rankings\?/);
    await expect(page).toHaveURL(/scope=organizer/);
    await expect(page.getByRole('heading', { name: 'National Rankings', level: 1 })).toBeVisible();
    await expect(scopeSelect).toHaveValue('organizer');
  });
});
