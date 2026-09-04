import { normalizeKeyword } from './normalizeKeyword';

export type MatchMode = 'EXACT' | 'CONTAINS_WORD';

// A character is a "word" character for boundary purposes once the
// comment has already been through normalizeKeyword (NFD-stripped,
// uppercased) — so plain ASCII letters/digits are enough here; anything
// else (spaces, punctuation, quote marks, emoji) is a boundary.
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Z0-9]/.test(char);
}

function containsWholeWord(normalizedComment: string, normalizedKeyword: string): boolean {
  let searchFrom = 0;
  for (;;) {
    const index = normalizedComment.indexOf(normalizedKeyword, searchFrom);
    if (index === -1) {
      return false;
    }
    const before = normalizedComment[index - 1];
    const after = normalizedComment[index + normalizedKeyword.length];
    if (!isWordChar(before) && !isWordChar(after)) {
      return true;
    }
    searchFrom = index + 1;
  }
}

export function matchesKeyword(comment: string, keyword: string, matchMode: MatchMode): boolean {
  const normalizedComment = normalizeKeyword(comment);
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (matchMode === 'EXACT') {
    return normalizedComment === normalizedKeyword;
  }

  return containsWholeWord(normalizedComment, normalizedKeyword);
}
