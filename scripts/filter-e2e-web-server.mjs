import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requireEnvironmentValue(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be explicitly set for the isolated filter E2E server.`);
    }
    return value;
}

function isInsideDirectory(directory, target) {
    const pathFromDirectory = relative(directory, target);
    return pathFromDirectory !== '' &&
        pathFromDirectory !== '..' &&
        !pathFromDirectory.startsWith(`..${sep}`) &&
        !isAbsolute(pathFromDirectory);
}

function runSetupAndBuild(args, env) {
    const result = spawnSync(process.execPath, args, {
        cwd: repositoryRoot,
        env,
        stdio: 'inherit',
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Filter E2E setup/build failed with exit code ${result.status}.`);
    }
}

function startPreview(args, env) {
    const preview = spawn(process.execPath, args, {
        cwd: repositoryRoot,
        env,
        stdio: 'inherit',
    });

    const stopPreview = () => {
        if (preview.exitCode === null && !preview.killed) {
            preview.kill();
        }
    };
    process.on('SIGINT', stopPreview);
    process.on('SIGTERM', stopPreview);

    preview.on('error', (error) => {
        console.error('Could not start the isolated filter E2E preview:', error);
        process.exitCode = 1;
    });
    preview.on('exit', (code, signal) => {
        process.off('SIGINT', stopPreview);
        process.off('SIGTERM', stopPreview);
        process.exitCode = signal ? 1 : (code ?? 1);
    });
}

function main() {
    const mode = requireEnvironmentValue('FILTER_E2E_MODE');
    const temporaryDirectory = resolve(requireEnvironmentValue('FILTER_E2E_TEMP_DIR'));
    const databaseUrl = requireEnvironmentValue('FILTER_E2E_DATABASE_URL');
    const configuredDatabaseUrl = requireEnvironmentValue('DATABASE_URL');
    const csvPath = resolve(requireEnvironmentValue('FILTER_E2E_CSV_PATH'));
    const outputDirectory = resolve(requireEnvironmentValue('FILTER_E2E_OUT_DIR'));
    const port = Number(requireEnvironmentValue('FILTER_E2E_PORT'));

    if (!['normal', 'empty-fixture'].includes(mode)) {
        throw new Error(`Unsupported FILTER_E2E_MODE: ${mode}`);
    }
    if (!databaseUrl.startsWith('file:') || databaseUrl !== configuredDatabaseUrl) {
        throw new Error('DATABASE_URL must explicitly match FILTER_E2E_DATABASE_URL.');
    }
    const databasePath = resolve(databaseUrl.slice('file:'.length));
    if (
        databasePath === resolve(repositoryRoot, 'tailspin.db') ||
        !basename(temporaryDirectory).startsWith('.tailspin-filter-e2e-') ||
        !isInsideDirectory(repositoryRoot, temporaryDirectory) ||
        !isInsideDirectory(temporaryDirectory, databasePath)
    ) {
        throw new Error('Refusing to use the regular database or a path outside the test directory.');
    }
    if (
        !isInsideDirectory(temporaryDirectory, outputDirectory) ||
        outputDirectory === resolve(repositoryRoot, 'dist')
    ) {
        throw new Error('Refusing to build outside the dedicated filter E2E temporary directory.');
    }

    const expectedCsvPath = resolve(
        repositoryRoot,
        mode === 'normal' ? 'db/games.csv' : 'db/fixtures/filter-empty-games.csv',
    );
    if (csvPath !== expectedCsvPath || !existsSync(csvPath)) {
        throw new Error(`Refusing unexpected or missing filter E2E CSV path: ${csvPath}`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('FILTER_E2E_PORT must be a valid TCP port.');
    }

    const env = { ...process.env, DATABASE_URL: databaseUrl };
    const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
    const astroCli = join(repositoryRoot, 'node_modules/astro/bin/astro.mjs');
    runSetupAndBuild(
        [tsxCli, 'scripts/setup-filter-e2e-db.ts'],
        env,
    );
    runSetupAndBuild(
        [astroCli, 'build', '--mode', 'e2e', '--outDir', outputDirectory],
        env,
    );

    startPreview(
        [
            astroCli,
            'preview',
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--outDir',
            outputDirectory,
        ],
        env,
    );
}

try {
    main();
} catch (error) {
    console.error('Isolated filter E2E server failed:', error);
    process.exitCode = 1;
}
