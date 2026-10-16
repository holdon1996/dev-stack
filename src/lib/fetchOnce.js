/**
 * Version lists change rarely: fetch each at most once per `ttl` instead of on every page
 * visit (the Apache list alone is ~6 web pages; GitHub allows 60 anonymous calls an hour).
 */
const fetchedAt = new Map();
const HOUR = 60 * 60 * 1000;

/** True, and remembers the time, when `name` was not fetched within `ttl` ms. */
export function shouldFetch(name, ttl = HOUR, now = Date.now()) {
    if (now - (fetchedAt.get(name) ?? -Infinity) < ttl) return false;
    fetchedAt.set(name, now);
    return true;
}

/** Forget `name` so the next call fetches again (after a failure, or for a Refresh button). */
export const forgetFetch = (name) => fetchedAt.delete(name);
