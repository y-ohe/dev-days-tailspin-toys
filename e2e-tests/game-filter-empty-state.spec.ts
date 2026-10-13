import { DatabaseSync } from 'node:sqlite';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { test, expect } from '@playwright/test';

interface FixtureDatabaseCounts {
  total: number;
  puzzleFromNova: number;
}

function isInsideDirectory(directory: string, target: string): boolean {
  const pathFromDirectory = relative(directory, target);
  return pathFromDirectory !== '' &&
    pathFromDirectory !== '..' &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory);
}

function inspectFixtureDatabase(): FixtureDatabaseCounts {
  const databaseUrl = process.env.FILTER_E2E_DATABASE_URL;
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  const mode = process.env.FILTER_E2E_MODE;
  const temporaryDirectory = process.env.FILTER_E2E_TEMP_DIR;
  if (
    !databaseUrl ||
    !databaseUrl.startsWith('file:') ||
    databaseUrl !== configuredDatabaseUrl ||
    mode !== 'empty-fixture'
  ) {
    throw new Error('The empty-state E2E test requires its explicit fixture database URL.');
  }
  if (!temporaryDirectory) {
    throw new Error('The empty-state E2E test requires its explicit temporary directory.');
  }

  const databasePath = resolve(databaseUrl.slice('file:'.length));
  const pathFromTemporaryDirectory = relative(resolve(temporaryDirectory), databasePath);
  if (
    databasePath === resolve(process.cwd(), 'tailspin.db') ||
    !basename(temporaryDirectory).startsWith('tailspin-filter-e2e-') ||
    !isInsideDirectory(resolve(tmpdir()), resolve(temporaryDirectory)) ||
    pathFromTemporaryDirectory === '' ||
    pathFromTemporaryDirectory === '..' ||
    pathFromTemporaryDirectory.startsWith(`..${sep}`) ||
    isAbsolute(pathFromTemporaryDirectory)
  ) {
    throw new Error('The empty-state E2E test refuses to inspect a database outside its fixture directory.');
  }

  const sqlite = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = sqlite
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN categories.name = 'Puzzle' AND publishers.name = 'NovaInteractive'
            THEN 1 ELSE 0 END) AS puzzleFromNova
        FROM games
        JOIN categories ON categories.id = games.category_id
        JOIN publishers ON publishers.id = games.publisher_id`,
      )
      .get();
    if (!row) {
      throw new Error('The fixture database inspection query returned no row.');
    }
    return {
      total: Number(row.total),
      puzzleFromNova: Number(row.puzzleFromNova),
    };
  } finally {
    sqlite.close();
  }
}

test('empty fixture: Puzzle and NovaInteractive returns no games and clearing restores all three', async ({
  page,
}) => {
  const counts = inspectFixtureDatabase();
  expect(counts).toEqual({ total: 3, puzzleFromNova: 0 });

  await page.goto('/');
  await expect(page.getByTestId('games-grid')).toBeVisible();
  const allGames = page.getByTestId('game-card');
  await expect(allGames).toHaveCount(3);

  await page.getByRole('checkbox', { name: 'Puzzle', exact: true }).check();
  await page.getByLabel('Publisher').selectOption({ label: 'NovaInteractive' });

  await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 0 of 3 games');
  await expect(page.getByTestId('filter-empty-state')).toBeVisible();
  await expect(page.getByTestId('empty-state-text')).toHaveText(
    'No games match the selected filters.',
  );
  await expect(allGames).toHaveCount(3);
  await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(0);

  await page.getByTestId('clear-filters').click();
  await expect(page.getByTestId('filter-empty-state')).toBeHidden();
  await expect(page.getByTestId('filter-result-count')).toHaveText('Showing 3 of 3 games');
  await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(3);
});
