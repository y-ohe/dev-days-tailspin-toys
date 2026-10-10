/**
 * Pure formatting helpers for game star ratings.
 *
 * Kept framework-free and side-effect-free so the logic is unit-testable
 * without the Astro runtime (see `ratings.test.ts`). Consumed by the
 * `StarRating.astro` component.
 */

/**
 * Constrain a rating to the displayable 0–5 range.
 *
 * @param rating - Rating value to constrain.
 * @returns The rating bounded by zero and five.
 */
export function clampRating(rating: number): number {
    return Math.min(5, Math.max(0, rating));
}

/**
 * Format a rating as five full, half, or empty star positions.
 *
 * @param rating - Rating to format, or `null` when it is unavailable.
 * @returns Five star positions, or `'Not yet rated'` for a `null` rating.
 */
export function formatStarRating(rating: number | null): string {
    if (rating === null) return 'Not yet rated';

    const clamped = clampRating(rating);
    const fullStars = Math.floor(clamped);
    const halfStar = clamped % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    return '★'.repeat(fullStars) + (halfStar ? '½' : '') + '☆'.repeat(emptyStars);
}
