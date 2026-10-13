import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
    getGamesByFilters,
} from './games';

interface FilterFixtures {
    strategyId: number;
    puzzleId: number;
    adventureId: number;
    publisherOneId: number;
    publisherTwoId: number;
}

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

async function seedFilterGames(db: Database): Promise<FilterFixtures> {
    const [strategy] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'strategy' })
        .returning({ id: categories.id });
    const [puzzle] = await db
        .insert(categories)
        .values({ name: 'Puzzle', description: 'puzzle' })
        .returning({ id: categories.id });
    const [adventure] = await db
        .insert(categories)
        .values({ name: 'Adventure', description: 'adventure' })
        .returning({ id: categories.id });
    const [publisherOne] = await db
        .insert(publishers)
        .values({ name: 'Publisher One', description: 'publisher one' })
        .returning({ id: publishers.id });
    const [publisherTwo] = await db
        .insert(publishers)
        .values({ name: 'Publisher Two', description: 'publisher two' })
        .returning({ id: publishers.id });

    await db.insert(games).values([
        {
            title: 'Alpha Strategy',
            description: 'Strategy game',
            categoryId: strategy.id,
            publisherId: publisherOne.id,
        },
        {
            title: 'Beta Puzzle',
            description: 'Puzzle game',
            categoryId: puzzle.id,
            publisherId: publisherOne.id,
        },
        {
            title: 'Gamma Puzzle',
            description: 'Another puzzle game',
            categoryId: puzzle.id,
            publisherId: publisherTwo.id,
        },
        {
            title: 'Delta Adventure',
            description: 'Adventure game',
            categoryId: adventure.id,
            publisherId: publisherTwo.id,
        },
    ]);

    return {
        strategyId: strategy.id,
        puzzleId: puzzle.id,
        adventureId: adventure.id,
        publisherOneId: publisherOne.id,
        publisherTwoId: publisherTwo.id,
    };
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('matches any selected category and keeps title ordering', async () => {
        const fixtures = await seedFilterGames(db);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [fixtures.strategyId, fixtures.puzzleId],
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Gamma Puzzle',
        ]);
    });

    it('filters by publisher when no categories are selected', async () => {
        const fixtures = await seedFilterGames(db);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [],
            publisherId: fixtures.publisherTwoId,
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Delta Adventure',
            'Gamma Puzzle',
        ]);
    });

    it('combines category and publisher filters with AND', async () => {
        const fixtures = await seedFilterGames(db);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [fixtures.strategyId, fixtures.puzzleId],
            publisherId: fixtures.publisherTwoId,
        });

        expect(filtered.map((game) => game.title)).toEqual(['Gamma Puzzle']);
    });

    it('returns no games when the category and publisher do not match', async () => {
        const fixtures = await seedFilterGames(db);

        const filtered = await getGamesByFilters(db, {
            categoryIds: [fixtures.adventureId],
            publisherId: fixtures.publisherOneId,
        });

        expect(filtered).toEqual([]);
    });

    it('returns all games when no filters are selected', async () => {
        await seedFilterGames(db);

        const filtered = await getGamesByFilters(db, { categoryIds: [] });

        expect(filtered.map((game) => game.title)).toEqual([
            'Alpha Strategy',
            'Beta Puzzle',
            'Delta Adventure',
            'Gamma Puzzle',
        ]);
    });
});
