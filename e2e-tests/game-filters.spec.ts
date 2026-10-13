import { test, expect, type Locator, type Page } from '@playwright/test';

interface GameCardFixture {
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  publisherId: string | null;
}

async function getGameCards(page: Page): Promise<GameCardFixture[]> {
  return page.getByTestId('game-card').evaluateAll((cards) =>
    cards.map((card) => ({
      title: card.getAttribute('data-game-title') ?? '',
      categoryId: card.getAttribute('data-game-category-id'),
      categoryName:
        card.querySelector('[data-testid="game-category"]')?.textContent?.trim() ?? null,
      publisherId: card.getAttribute('data-game-publisher-id'),
    })),
  );
}

async function getControlValue(control: Locator, name: string): Promise<string> {
  const value = await control.getAttribute('value');
  if (value === null) {
    throw new Error(`Filter control ${name} has no value.`);
  }
  return value;
}

async function expectVisibleTitles(page: Page, titles: string[]): Promise<void> {
  const visibleCards = page.locator('[data-testid="game-card"]:visible');
  await expect(visibleCards).toHaveCount(titles.length);
  await expect(page.getByTestId('filter-result-count')).toHaveText(
    `Showing ${titles.length} of ${(await getGameCards(page)).length} games`,
  );
  expect(
    await visibleCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-game-title') ?? ''),
    ),
  ).toEqual(titles);
}

test.describe('Game filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('games-grid')).toBeVisible();
  });

  test('matches any selected category and updates results when one is deselected', async ({ page }) => {
    const allGames = await getGameCards(page);
    const strategy = page.getByRole('checkbox', { name: 'Strategy', exact: true });
    const puzzle = page.getByRole('checkbox', { name: 'Puzzle', exact: true });
    const selectedCategoryIds = new Set([
      await getControlValue(strategy, 'Strategy'),
      await getControlValue(puzzle, 'Puzzle'),
    ]);

    await strategy.check();
    await puzzle.check();

    const expectedWithBothCategories = allGames
      .filter((game) => game.categoryId !== null && selectedCategoryIds.has(game.categoryId))
      .map((game) => game.title);
    await expectVisibleTitles(page, expectedWithBothCategories);

    await strategy.uncheck();
    const puzzleCategoryId = await getControlValue(puzzle, 'Puzzle');
    const expectedWithPuzzleOnly = allGames
      .filter((game) => game.categoryId === puzzleCategoryId)
      .map((game) => game.title);
    await expectVisibleTitles(page, expectedWithPuzzleOnly);
  });

  test('shows all four Strategy and Puzzle games when both categories are selected', async ({ page }) => {
    const allGames = await getGameCards(page);
    const strategy = page.getByRole('checkbox', { name: 'Strategy', exact: true });
    const puzzle = page.getByRole('checkbox', { name: 'Puzzle', exact: true });

    expect(allGames.filter((game) => game.categoryName === 'Strategy')).toHaveLength(4);
    expect(allGames.filter((game) => game.categoryName === 'Puzzle')).toHaveLength(4);

    await strategy.check();
    await puzzle.check();

    const visibleGames = allGames.filter(
      (game) => game.categoryName === 'Strategy' || game.categoryName === 'Puzzle',
    );
    await expectVisibleTitles(page, visibleGames.map((game) => game.title));
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(8);
    expect(new Set(visibleGames.map((game) => game.categoryName))).toEqual(
      new Set(['Strategy', 'Puzzle']),
    );
  });

  test('combines category and publisher filters and clears all selections', async ({ page }) => {
    const allGames = await getGameCards(page);
    const strategy = page.getByRole('checkbox', { name: 'Strategy', exact: true });
    const puzzle = page.getByRole('checkbox', { name: 'Puzzle', exact: true });
    const categoryIds = new Set([
      await getControlValue(strategy, 'Strategy'),
      await getControlValue(puzzle, 'Puzzle'),
    ]);
    const publisherFilter = page.getByLabel('Publisher');
    const publisherOption = publisherFilter.getByRole('option', {
      name: 'CodeForge Studios',
      exact: true,
    });
    const publisherId = await publisherOption.getAttribute('value');
    if (publisherId === null) {
      throw new Error('CodeForge Studios publisher option has no value.');
    }

    await strategy.check();
    await puzzle.check();
    await publisherFilter.selectOption(publisherId);

    const expectedCombined = allGames
      .filter(
        (game) =>
          game.categoryId !== null &&
          categoryIds.has(game.categoryId) &&
          game.publisherId === publisherId,
      )
      .map((game) => game.title);
    await expectVisibleTitles(page, expectedCombined);

    await puzzle.uncheck();
    const strategyCategoryId = await getControlValue(strategy, 'Strategy');
    const expectedAfterDeselection = allGames
      .filter((game) => game.categoryId === strategyCategoryId)
      .filter((game) => game.publisherId === publisherId)
      .map((game) => game.title);
    await expectVisibleTitles(page, expectedAfterDeselection);

    await page.getByTestId('clear-filters').click();
    await expect(strategy).not.toBeChecked();
    await expect(puzzle).not.toBeChecked();
    await expect(publisherFilter).toHaveValue('');
    await expectVisibleTitles(page, allGames.map((game) => game.title));
  });

  test('shows and recovers from a zero-result state', async ({ page }) => {
    const publisherFilter = page.getByLabel('Publisher');

    await publisherFilter.evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error('Publisher filter is not a select control.');
      }
      element.add(new Option('Publisher with no matching games', 'unmatched-publisher'));
    });
    await publisherFilter.selectOption('unmatched-publisher');

    await expect(page.getByTestId('filter-empty-state')).toBeVisible();
    await expect(page.getByTestId('empty-state-text')).toHaveText(
      'No games match the selected filters.',
    );
    await expect(page.getByTestId('game-filters')).toBeVisible();
    await expectVisibleTitles(page, []);

    await page.getByTestId('clear-filters').click();
    await expect(page.getByTestId('filter-empty-state')).toBeHidden();
    await expectVisibleTitles(
      page,
      (await getGameCards(page)).map((game) => game.title),
    );
  });

  test('tabs from Publisher to Clear filters and activates it with Enter', async ({ page }) => {
    const publisherFilter = page.getByLabel('Publisher');
    const clearFilters = page.getByTestId('clear-filters');
    const allGames = await getGameCards(page);
    let publisherReached = false;

    for (let tabCount = 0; tabCount < 40 && !publisherReached; tabCount += 1) {
      await page.keyboard.press('Tab');
      publisherReached = await publisherFilter.evaluate(
        (element) => element === document.activeElement,
      );
    }
    expect(publisherReached).toBeTruthy();

    await page.keyboard.press('ArrowDown');
    await expect(publisherFilter).not.toHaveValue('');
    await page.keyboard.press('Tab');
    await expect(clearFilters).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(publisherFilter).toHaveValue('');
    await expectVisibleTitles(page, allGames.map((game) => game.title));
  });
});
