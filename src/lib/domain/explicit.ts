const DIACRITIC_PATTERN = /\p{Diacritic}/gu;

/**
 * Conservative base list of common strong Spanish/English profanity used when
 * a room does not provide its own keywords. Matching is whole-word after
 * accent/case normalization, so substrings such as "Sexto" never match.
 */
export const DEFAULT_EXPLICIT_KEYWORDS: readonly string[] = [
  "puta",
  "puto",
  "mierda",
  "joder",
  "jodete",
  "cabron",
  "cabrona",
  "pendejo",
  "pendeja",
  "chinga",
  "chingar",
  "verga",
  "culo",
  "gilipollas",
  "fuck",
  "fucked",
  "fucking",
  "motherfucker",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
];

export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findExplicitKeyword(text: string, keywords: readonly string[]): string | null {
  const normalizedText = normalizeForMatch(text);

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForMatch(keyword);

    if (normalizedKeyword.length === 0) {
      continue;
    }

    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedKeyword)}($|[^\\p{L}\\p{N}])`,
      "u",
    );

    if (pattern.test(normalizedText)) {
      return keyword;
    }
  }

  return null;
}
