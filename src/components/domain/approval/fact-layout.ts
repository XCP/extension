/**
 * How long a piece of approval text is, measured the way it takes up a line.
 *
 * A full-width character (kana, CJK ideographs, Hangul, full-width forms) takes about the space of
 * two Latin letters, so it counts as two. `scripts/i18n.mjs` measures fact labels with the same
 * rule; keep the two in step. Its label budget: 18 units (18 Latin or 9 full-width characters) at
 * popup width and 28 (14 full-width) in the side panel; every approval can open in the popup, so
 * the popup budget is the one enforced.
 */
const FULL_WIDTH = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += FULL_WIDTH.test(char) ? 2 : 1;
  return width;
}

/**
 * Text short enough to sit on the value side of a row: at most three words and 16 half-width
 * units (8 full-width), with no closing full stop. Anything longer is prose and goes under its
 * label, where it can wrap like a sentence.
 */
export function isShortText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /[.。．!！?？]$/u.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 3 && displayWidth(trimmed) <= 16;
}
