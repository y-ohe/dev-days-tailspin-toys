import { and, eq, asc, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

/** Optional criteria for filtering games by category and publisher. */
export interface GameFilters {
    /** Category IDs; games in any selected category match. */
    categoryIds?: number[];
    /** Publisher ID that a matching game must have. */
    publisherId?: number;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Fetch all games with category and publisher details, ordered by title.
 *
 * @param db - Production or test database used for the query.
 * @returns All matching games in title order.
 */
export async function getAllGames(db: Database): Promise<Game[]> {
    const rows = await baseGamesQuery(db).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Fetch games matching optional category and publisher filters, ordered by title.
 *
 * @param db - Production or test database used for the query.
 * @param filters - Optional category IDs (matched with OR) and publisher ID (combined with AND).
 * @returns Matching games in title order; an empty category list applies no category filter.
 */
export async function getGamesByFilters(
    db: Database,
    filters: GameFilters = {},
): Promise<Game[]> {
    const conditions: SQL[] = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }

    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    const rows = await baseGamesQuery(db)
        .where(and(...conditions))
        .orderBy(asc(games.title));
    return rows.map(mapGame);
}

/**
 * Fetch game IDs in title order.
 *
 * @param db - Production or test database used for the query.
 * @returns All game IDs in title order.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Fetch one game with category and publisher details.
 *
 * @param db - Production or test database used for the query.
 * @param id - ID of the game to fetch.
 * @returns The matching game, or `null` if the ID does not exist.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
