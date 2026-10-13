import { test, expect } from '@playwright/test';

test.describe('Game title search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('games-grid')).toBeVisible();
  });

  test('matches titles case-insensitively, trims whitespace, and supports partial titles', async ({
    page,
  }) => {
    const search = page.getByRole('searchbox', { name: 'Search games by title' });
    const visibleCards = page.locator('[data-testid="game-card"]:visible');

    await search.fill('  pIpE  ');

    await expect(visibleCards).toHaveCount(1);
    await expect(visibleCards).toHaveAttribute(
      'data-game-title',
      'Pipeline Conquest',
    );
    await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 1 of 21 games');
    await expect(visibleCards.getByTestId('game-rating')).toBeVisible();
    await expect(visibleCards.getByTestId('game-rating')).toContainText('3.9');

    await search.fill(' code ');

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(2);
    await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 2 of 21 games');
    await expect(
      page.locator('[data-testid="game-card"]:visible [data-testid="game-title"]'),
    ).toHaveText(['Code Puzzle Chronicles', 'Code Quest Odyssey']);
  });

  test('combines title, category, and publisher filters with AND and clears the results', async ({
    page,
  }) => {
    const search = page.getByRole('searchbox', { name: 'Search games by title' });
    const strategy = page.getByRole('checkbox', { name: 'Strategy', exact: true });
    const publisher = page.getByLabel('Publisher');
    const visibleCards = page.locator('[data-testid="game-card"]:visible');

    await strategy.check();
    await publisher.selectOption({ label: 'DevMasters Inc.' });
    await search.fill('pipeline');

    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(1);
    await expect(visibleCards).toHaveAttribute(
      'data-game-title',
      'Pipeline Conquest',
    );

    await publisher.selectOption({ label: 'CodeForge Studios' });

    await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 0 of 21 games');
    await expect(page.getByTestId('filter-empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state-text')).toHaveText(
      'No games match the selected filters.',
    );

    await page.getByTestId('clear-filters').click();

    await expect(search).toHaveValue('');
    await expect(strategy).not.toBeChecked();
    await expect(publisher).toHaveValue('');
    await expect(page.getByTestId('filter-empty-state')).toBeHidden();
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(21);
  });

  test('supports keyboard entry and clearing the search term', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search games by title' });
    let searchReached = false;

    for (let tabCount = 0; tabCount < 50 && !searchReached; tabCount += 1) {
      await page.keyboard.press('Tab');
      searchReached = await search.evaluate((element) => element === document.activeElement);
    }
    expect(searchReached).toBeTruthy();

    await page.keyboard.type('zzzz');
    await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 0 of 21 games');
    await expect(page.getByTestId('filter-empty-state')).toBeVisible();

    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');

    await expect(search).toHaveValue('');
    await expect(page.getByTestId('filter-empty-state')).toBeHidden();
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(21);
  });
});
