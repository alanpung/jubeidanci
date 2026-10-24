/**
 * Equivalence groups for translation exercises.
 *
 * A Chinese prompt often has more than one equally valid English rendering of a
 * single word — "我希望" can be "I wish" or "I hope", "开始" can be "start" or
 * "begin". Translation exercises are checked slot by slot against the target
 * sentence, so without these groups a learner who writes a perfectly good
 * synonym is marked wrong.
 *
 * Rules of the road for adding a group:
 *   - Only content words (nouns, verbs, adjectives, adverbs). Never function
 *     words — "a", "the", "to", "of", "is" … — or a learner can pass a slot by
 *     typing any grammatical filler.
 *   - Members must be genuinely interchangeable in the same slot, not just
 *     loosely related: "wish"/"hope" yes, "like"/"love" no.
 *   - Same inflection only: both members are base forms. `checkWordMatch`
 *     compares inflections separately, so "hoping" never matches "wish".
 */

const SYNONYM_GROUPS: string[][] = [
  // --- wanting, feeling, thinking -----------------------------------------
  ["wish", "hope"],
  ["think", "believe"],
  ["understand", "realize"],
  ["remember", "recall"],
  ["sure", "certain"],
  // 高兴 / greetings: nice to meet you ≈ happy/glad/pleased to meet you
  ["nice", "happy", "glad", "pleased"],
  ["sad", "unhappy"],
  ["angry", "mad"],
  ["afraid", "scared"],
  ["ill", "sick"],
  ["tired", "sleepy"],

  // --- describing things ---------------------------------------------------
  ["big", "large"],
  ["small", "little"],
  ["huge", "enormous", "giant"],
  ["difficult", "hard"],
  ["easy", "simple"],
  ["fast", "quick"],
  ["quickly", "fast"],
  ["beautiful", "pretty"],
  ["clever", "smart", "intelligent"],
  ["tasty", "delicious"],
  ["expensive", "costly"],
  ["cheap", "inexpensive"],
  ["rich", "wealthy"],
  ["correct", "right"],
  ["wrong", "incorrect"],
  ["same", "identical"],
  ["usual", "normal"],
  ["quiet", "silent"],
  ["noisy", "loud"],
  ["dangerous", "unsafe"],
  ["safe", "secure"],
  ["ready", "prepared"],
  ["friendly", "kind"],
  ["boring", "dull"],
  ["about", "around"],

  // --- doing things --------------------------------------------------------
  ["start", "begin"],
  ["end", "finish"],
  ["need", "require"],
  ["buy", "purchase"],
  ["help", "assist"],
  ["speak", "talk"],
  ["study", "learn"],
  ["try", "attempt"],
  ["use", "utilize"],
  ["show", "display"],
  ["tell", "inform"],
  ["put", "place"],
  ["stay", "remain"],
  ["fix", "repair", "mend"],
  ["build", "construct"],
  ["find", "discover"],
  ["choose", "select", "pick"],
  ["close", "shut"],
  ["call", "phone"],
  ["send", "post", "mail"],
  ["answer", "reply"],
  ["wear", "put on"],

  // --- everyday nouns ------------------------------------------------------
  ["gift", "present"],
  ["film", "movie"],
  ["photo", "picture"],
  ["taxi", "cab"],
  ["shop", "store"],
  ["holiday", "vacation"],
  ["flat", "apartment"],
  ["lorry", "truck"],
  ["bus", "coach"],
  ["sofa", "couch"],
  ["trousers", "pants"],
  ["phone", "telephone"],
  ["fridge", "refrigerator"],
  ["autumn", "fall"],
  ["mum", "mom", "mother"],
  ["dad", "father"],
  ["grandma", "grandmother"],
  ["grandpa", "grandfather"],
  ["child", "kid"],
  ["clothes", "clothing"],
  ["dinner", "supper"],
  ["test", "exam"],
  ["lesson", "class"],
  ["student", "pupil"],
  ["trip", "journey"],
  ["problem", "issue"],

  // --- transport & places (US/UK spellings + common synonyms) ------------
  ["metro", "subway", "underground", "tube", "train"],
  ["bike", "bicycle", "cycle"],
  ["car", "automobile"],
  ["lift", "elevator"],
  ["boat", "ship"],
  ["road", "street"],
  ["path", "trail"],
  ["center", "centre"],
  ["color", "colour"],
  ["favorite", "favourite"],
  ["neighbor", "neighbour"],
  ["travel", "trip", "journey"],
  ["bag", "sack"],
  ["garbage", "rubbish", "trash"],
  ["restroom", "toilet", "bathroom"],
  ["cellphone", "mobile"],
  ["flashlight", "torch"],
  ["cookie", "biscuit"],
  ["sweater", "jumper"],
  ["candy", "sweet"],
  ["line", "queue"],

  // --- frequency, degree, manner ------------------------------------------
  ["often", "frequently"],
  ["sometimes", "occasionally"],
  ["usually", "normally"],
  ["rarely", "seldom"],
  ["maybe", "perhaps"],
  ["almost", "nearly"],
  ["finally", "eventually"],
  ["soon", "shortly"],
  ["just", "only"],
];

/** Lowercase + strip punctuation + strip diacritics, good enough for lookups. */
function norm(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[.,;:!?¿¡"'`()[\]{}]+|[.,;:!?¿¡"'`()[\]{}]+$/g, "")
    .trim();
}

/** Split a token into (stem-ish, inflection) so "hoping" !== "wish". */
function splitInflection(token: string): [string, string] {
  const t = norm(token);
  if (!t) return ["", ""];
  if (t.endsWith("ies") && t.length > 4) return [t.slice(0, -3) + "y", "ies"];
  if (t.endsWith("ing") && t.length > 5) return [t.slice(0, -3), "ing"];
  if (t.endsWith("ed") && t.length > 4) return [t.slice(0, -2), "ed"];
  if (t.endsWith("ses") || t.endsWith("xes") || t.endsWith("ches") || t.endsWith("shes")) {
    return [t.slice(0, -2), "es"];
  }
  if (t.endsWith("es") && t.length > 4) return [t.slice(0, -2), "es"];
  if (t.endsWith("s") && t.length > 3) return [t.slice(0, -1), "s"];
  return [t, ""];
}

/** Regular inflections of a base form, bucketed by kind. */
function inflections(word: string): Record<string, string> {
  const w = word;
  const s = /(s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`;
  const ed = w.endsWith("e")
    ? `${w}d`
    : /[^aeiou]y$/.test(w)
      ? `${w.slice(0, -1)}ied`
      : `${w}ed`;
  const ing = w.endsWith("e") ? `${w.slice(0, -1)}ing` : `${w}ing`;
  const out: Record<string, string> = { base: w, s, ed, ing };
  if (/[^aeiou]y$/.test(w)) out.ies = `${w.slice(0, -1)}ies`;
  return out;
}

const INFLECTION_KINDS = ["base", "s", "ed", "ing", "ies"] as const;

/**
 * form -> equivalent forms *in the same inflection bucket*. Built by expanding
 * every group, so "hope" <-> "wish", "hopes" <-> "wishes", "hoping" <-> "wishing",
 * but never "hoping" <-> "wish".
 */
const EQUIVALENT_FORMS: Map<string, Set<string>> = (() => {
  const index = new Map<string, Set<string>>();

  const link = (a: string, b: string) => {
    let sa = index.get(a);
    if (!sa) index.set(a, (sa = new Set<string>()));
    sa.add(b);
  };

  for (const group of SYNONYM_GROUPS) {
    const forms = group
      .map(norm)
      .filter((w) => w && !w.includes(" "))
      .map(inflections);

    for (const kind of INFLECTION_KINDS) {
      const bucket = forms
        .map((f) => f[kind])
        .filter((v): v is string => Boolean(v));
      for (const a of bucket) {
        for (const b of bucket) {
          if (a !== b) link(a, b);
        }
      }
    }
  }

  return index;
})();

/**
 * True when two tokens are accepted as the same answer for a slot: either
 * identical after normalization, or equivalent synonyms in the same inflection
 * ("hope"/"wish", "hoping"/"wishing" — but not "hoping"/"wish").
 */
export function isEquivalentToken(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return EQUIVALENT_FORMS.get(na)?.has(nb) ?? false;
}

/** Other words accepted in place of `token`, in the same inflection. */
export function synonymsOf(token: string): string[] {
  const n = norm(token);
  if (!n) return [];
  const infl = splitInflection(n)[1];
  return [...(EQUIVALENT_FORMS.get(n) ?? [])].filter(
    (alt) => splitInflection(alt)[1] === infl,
  );
}

/**
 * Build alternative sentences by swapping a single word for a synonym, e.g.
 * "I wish to go" -> "I hope to go". Used to show learners which paraphrases
 * the checker also accepts.
 */
export function synonymSentenceVariants(sentence: string, limit = 2): string[] {
  const tokens = sentence.split(/(\s+)/); // keep whitespace so we can rebuild
  const out: string[] = [];
  const seen = new Set<string>([norm(sentence)]);

  for (let i = 0; i < tokens.length && out.length < limit; i++) {
    if (/^\s+$/.test(tokens[i])) continue;
    const alts = synonymsOf(tokens[i]);
    for (const alt of alts) {
      const next = [...tokens];
      // Preserve the original capitalisation style of the replaced word.
      next[i] = tokens[i][0] === tokens[i][0]?.toUpperCase() ? capitalize(alt) : alt;
      const candidate = next.join("");
      const key = norm(candidate);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(candidate);
      }
      if (out.length >= limit) break;
    }
  }

  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
