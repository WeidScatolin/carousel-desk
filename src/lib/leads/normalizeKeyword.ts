// Built from code points instead of a literal \uXXXX-\uXXXX regex escape
// to avoid any editor/transport layer normalizing the escape sequence
// into a literal combining character in this source file.
const COMBINING_MARK_RANGE_START = 0x0300;
const COMBINING_MARK_RANGE_END = 0x036f;
const combiningDiacriticalMarks = new RegExp(
  `[${String.fromCharCode(COMBINING_MARK_RANGE_START)}-${String.fromCharCode(COMBINING_MARK_RANGE_END)}]`,
  'g',
);

export function normalizeKeyword(value: string): string {
  return value
    .normalize('NFD')
    .replace(combiningDiacriticalMarks, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}
