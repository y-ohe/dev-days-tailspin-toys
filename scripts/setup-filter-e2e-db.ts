import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { executeMigrationQueries, createDatabaseConnection } from '../src/lib/db';
import { seedDatabase } from '../db/seed';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDatabasePath = resolve(repositoryRoot, 'tailspin.db');

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be explicitly set before preparing the E2E database.`);
  }
  return value;
}

function isInsideDirectory(directory: string, target: string): boolean {
  const pathFromDirectory = relative(directory, target);
  return pathFromDirectory !== '' &&
        pathFromDirectory !== '..' &&
        !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory);
}

async function prepareDatabase(): Promise<void> {
  const databaseUrl = requiredEnvironmentValue('FILTER_E2E_DATABASE_URL');
  const configuredDatabaseUrl = requiredEnvironmentValue('DATABASE_URL');
  const mode = requiredEnvironmentValue('FILTER_E2E_MODE');
  const temporaryDirectory = resolve(requiredEnvironmentValue('FILTER_E2E_TEMP_DIR'));
  const csvPath = resolve(requiredEnvironmentValue('FILTER_E2E_CSV_PATH'));

  if (!['normal', 'empty-fixture'].includes(mode)) {
    throw new Error(`Unsupported FILTER_E2E_MODE: ${mode}`);
  }
  if (!databaseUrl.startsWith('file:') || configuredDatabaseUrl !== databaseUrl) {
    throw new Error('DATABASE_URL must explicitly match FILTER_E2E_DATABASE_URL.');
  }

  const databasePath = resolve(databaseUrl.slice('file:'.length));
  if (
    databasePath === defaultDatabasePath ||
    !basename(temporaryDirectory).startsWith('.tailspin-filter-e2e-') ||
    !isInsideDirectory(repositoryRoot, temporaryDirectory) ||
    !isInsideDirectory(temporaryDirectory, databasePath)
  ) {
    throw new Error('Refusing to write outside the dedicated filter E2E temporary directory.');
  }

  const expectedCsvPath = resolve(
    repositoryRoot,
    mode === 'normal' ? 'db/games.csv' : 'db/fixtures/filter-empty-games.csv',
  );
  if (csvPath !== expectedCsvPath) {
    throw new Error(`Refusing unexpected filter E2E CSV path: ${csvPath}`);
  }

  const { db, sqlite } = createDatabaseConnection(databaseUrl);
  try {
    const migrationsFolder = join(repositoryRoot, 'db/migrations');
    await migrate(
      db,
      async (queries: string[]): Promise<void> => executeMigrationQueries(sqlite, queries),
      { migrationsFolder },
    );
    await seedDatabase(db, csvPath);
  } finally {
    sqlite.close();
  }
}

prepareDatabase().catch((error: unknown) => {
  console.error('Filter E2E database preparation failed:', error);
  process.exitCode = 1;
});
