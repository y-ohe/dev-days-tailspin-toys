import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const playwrightCli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
const temporaryDirectory = mkdtempSync(join(repositoryRoot, '.tailspin-filter-e2e-'));
const activeChildren = new Set();

function availablePort() {
    return new Promise((resolvePort, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Could not allocate a local E2E server port.'));
                return;
            }
            server.close((error) => (error ? reject(error) : resolvePort(address.port)));
        });
    });
}

function runPlaywright(args, env) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, [playwrightCli, 'test', ...args], {
            cwd: repositoryRoot,
            env,
            stdio: 'inherit',
        });
        activeChildren.add(child);
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            activeChildren.delete(child);
            if (signal) {
                reject(new Error(`Playwright exited after ${signal}.`));
            } else if (code !== 0) {
                reject(new Error(`Playwright exited with code ${code}.`));
            } else {
                resolveRun();
            }
        });
    });
}

function stopChildren() {
    for (const child of activeChildren) {
        if (child.exitCode === null) {
            child.kill();
        }
    }
}

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

async function runStage(mode, csvPath, playwrightArgs) {
    const stageDirectory = join(temporaryDirectory, mode);
    mkdirSync(stageDirectory, { recursive: true });
    const databaseUrl = `file:${join(stageDirectory, 'filter-e2e.sqlite')}`;
    const port = await availablePort();

    await runPlaywright(playwrightArgs, {
        ...process.env,
        FILTER_E2E_MODE: mode,
        FILTER_E2E_TEMP_DIR: temporaryDirectory,
        FILTER_E2E_DATABASE_URL: databaseUrl,
        FILTER_E2E_CSV_PATH: resolve(repositoryRoot, csvPath),
        FILTER_E2E_OUT_DIR: join(stageDirectory, 'dist'),
        FILTER_E2E_PORT: String(port),
        DATABASE_URL: databaseUrl,
    });
}

try {
    await runStage(
        'normal',
        'db/games.csv',
        ['--grep-invert', 'empty fixture:'],
    );
    await runStage(
        'empty-fixture',
        'db/fixtures/filter-empty-games.csv',
        ['e2e-tests/game-filter-empty-state.spec.ts'],
    );
} catch (error) {
    console.error('Filter E2E tests failed:', error);
    process.exitCode = 1;
} finally {
    stopChildren();
    process.off('SIGINT', stopChildren);
    process.off('SIGTERM', stopChildren);
    rmSync(temporaryDirectory, { recursive: true, force: true });
}
