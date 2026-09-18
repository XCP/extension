import type { PaginatedResponse } from './api';

/** Read a complete collection; failures must never turn a partial total into an answer. */
export async function collectPages<T>(
  fetchPage: (page: { limit: number; cursor?: string | number; offset?: number }) => Promise<PaginatedResponse<T>>,
  { limit = 100, cursorOnly = false } = {}
): Promise<PaginatedResponse<T>> {
  const result: T[] = [];
  const cursors = new Set<string>();
  const pages = new Set<string>();
  let position: { cursor?: string | number; offset?: number } = {};
  while (true) {
    const page = await fetchPage({ limit, ...position });
    if (!Array.isArray(page.result)) throw new Error('The API returned an invalid list.');
    const count = page.result_count;
    const hasCount = Number.isSafeInteger(count) && count >= 0;
    const next = page.next_cursor;
    if (page.result.length) {
      const fingerprint = JSON.stringify(page.result);
      if (pages.has(fingerprint)) throw new Error('The API repeated a page. Please retry.');
      pages.add(fingerprint);
      result.push(...page.result);
    }
    if (next !== null && next !== undefined) {
      if (!page.result.length || cursors.has(String(next))) throw new Error('The API repeated a cursor. Please retry.');
      cursors.add(String(next));
      position = { cursor: next };
      continue;
    }
    // A cursor response explicitly ending its list must agree with its advertised total.
    // Older nodes without cursor metadata can still be walked using offsets.
    if (page.next_cursor === null && position.offset === undefined) {
      if (hasCount && result.length < count) throw new Error('The API returned an incomplete list. Please retry.');
      break;
    }
    if (hasCount ? result.length >= count : page.result.length < limit) break;
    if (!page.result.length || cursorOnly) throw new Error('The API returned an incomplete list. Please retry.');
    position = { offset: result.length };
  }
  return { result, result_count: result.length, next_cursor: null };
}
