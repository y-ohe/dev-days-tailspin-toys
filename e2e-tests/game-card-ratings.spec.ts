import { test, expect } from '@playwright/test';

const ratings = [
  { id: '9001', text: '★★★★☆4.2' },
  { id: '9002', text: '☆☆☆☆☆0.0' },
  { id: '9003', text: '★★★★★5.0' },
  { id: '9004', text: 'No rating yet' },
];

test.describe('Game card ratings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/game-card-ratings/ratings');
  });

  for (const { id, text } of ratings) {
    test(`renders rating ${text} for game ${id}`, async ({ page }) => {
      const card = page.locator(`[data-game-id="${id}"]`);
      const rating = card.getByTestId('game-rating');

      await expect(card).toHaveCount(1);
      await expect(rating).toHaveText(text);
      await expect(rating).not.toContainText(id === '9004' ? /[★☆½]|[0-9]/ : 'No rating yet');
    });
  }

  test('preserves each game card link to its detail page', async ({ page }) => {
    const cards = page.getByTestId('game-card');

    await expect(cards).toHaveCount(4);
    for (const { id } of ratings) {
      await expect(page.locator(`[data-game-id="${id}"]`)).toHaveAttribute('href', `/game/${id}`);
    }
  });
});
