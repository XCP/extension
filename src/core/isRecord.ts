/** A plain JSON-style object: not null, not an array. Untrusted input is narrowed with this first. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
