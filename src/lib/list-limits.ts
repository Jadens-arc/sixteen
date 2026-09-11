/**
 * How many rows each list shows.
 *
 * These live apart from the queries that use them because the browser needs
 * them too: a sealed verse is filtered where the key is, so the browser is the
 * only side that can apply a limit to a locked account's search. Importing
 * them from src/lib/db/queries.ts would pull that module - and node:crypto
 * behind it - into the client bundle.
 */
export const ARCHIVE_LIMIT = 60;
export const NOTEBOOK_LIMIT = 200;
