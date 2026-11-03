const POS_ALIASES: Record<string, readonly string[]> = {
  noun: ["noun", "n"],
  verb: ["verb", "v", "vt", "vi", "v1", "be-verb", "have-verb", "do-verb", "modal", "auxiliary", "aux"],
  adjective: ["adjective", "adj", "a", "s"],
  adverb: ["adverb", "adv", "r"],
  preposition: ["preposition", "prep", "pp"],
  conjunction: ["conjunction", "conj", "cj"],
  pronoun: ["pronoun", "pron", "pn"],
  determiner: ["determiner", "det", "article", "art"],
  numeral: ["numeral", "num", "number"],
  interjection: ["interjection", "intj", "int", "interj"],
};

const ALIAS_TO_POS = new Map<string, string>(
  Object.entries(POS_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical] as const),
  ),
);

function normalizePosToken(raw: string): string {
  return raw.toLowerCase().trim().replace(/\.$/, "");
}

/** Resolve a complete POS tag/alias to its canonical filter key. */
export function normalizePos(raw: string): string | undefined {
  return ALIAS_TO_POS.get(normalizePosToken(raw));
}

/** Extract canonical POS keys from dictionary tags and POS-prefixed glosses. */
export function extractPosSet(...values: Array<string | null | undefined>): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    // POS fields are usually separated by punctuation/whitespace. Unknown
    // annotation tokens (e.g. "[keep as-is]") simply do not map to a POS.
    for (const token of value.split(/[,/;|·\s()[\]]+/).filter(Boolean)) {
      const canonical = normalizePos(token);
      if (canonical) result.add(canonical);
    }

    // Glosses often encode tags as prefixes such as "vt." or "n.".
    const prefix = /(?:^|[；;]\s*|\s+)([a-z][a-z0-9-]*)\./gi;
    let match: RegExpExecArray | null;
    while ((match = prefix.exec(value)) !== null) {
      const canonical = normalizePos(match[1]);
      if (canonical) result.add(canonical);
    }
  }
  return result;
}

export function matchesPosFilter(
  selectedPos: string,
  ...values: Array<string | null | undefined>
): boolean {
  const canonical = normalizePos(selectedPos);
  return canonical !== undefined && extractPosSet(...values).has(canonical);
}
