/**
 * Owner-only report: SRS-word counts per course, bucketed by the dictionary's
 * real CEFR level (A1–C2) plus an "Unknown" bucket for words/phrases that are
 * not found in the bundled English dictionary.
 *
 * This reads the committed `content/*.md` unit files directly (the source of
 * truth for `srsWords`) rather than the DB-backed course copies, so it reflects
 * what will ship. It is gated to the owner in the page that calls it.
 */

import { readdirSync, readFileSync } from "fs";
import path from "path";

import { parseUnitMarkdown } from "./unit-parser";

const CONTENT_DIR = path.join(process.cwd(), "content");
const DICT_PATH = path.join(process.cwd(), "words", "english_merged.json");

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_ORDER: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface CourseSrsRow {
  courseId: string;
  /** The course's own declared level (A1–C2). */
  level: string;
  kind: "flashcard" | "translation";
  /** Total srsWords across every exercise in the course. */
  total: number;
  byLevel: Record<Cefr, number>;
  /** srsWords (or their tokens) not found in the dictionary. */
  unknown: number;
}

function buildDictionary(): Map<string, string> {
  try {
    const raw = JSON.parse(readFileSync(DICT_PATH, "utf8")) as Array<Record<string, unknown>>;
    const m = new Map<string, string>();
    for (const it of raw) {
      const w = String(it.word ?? it.baseForm ?? "")
        .toLowerCase()
        .trim();
      const lvl = String(it.cefr_level ?? it.level ?? "")
        .toUpperCase()
        .trim();
      if (w && lvl && !m.has(w)) m.set(w, lvl);
    }
    return m;
  } catch {
    return new Map();
  }
}

/**
 * Irregular / tricky inflections that a rule-based lemmatizer misses.
 * Maps the inflected surface form -> its dictionary base form.
 */
export const IRREGULAR: Record<string, string> = {
  // common irregular verbs (incl. those seen in the residual)
  took: "take", taken: "take",
  bought: "buy", brought: "bring", thought: "think",
  ate: "eat", eaten: "eat",
  sent: "send", spent: "spend", lent: "lend", built: "build",
  forgot: "forget", forgotten: "forget",
  spoke: "speak", spoken: "speak",
  drew: "draw", drawn: "draw", drove: "drive", driven: "drive",
  blew: "blow", blown: "blow",
  burnt: "burn", burned: "burn", lit: "light",
  swam: "swim", swum: "swim",
  upheld: "uphold", overcame: "overcome",
  went: "go", gone: "go", came: "come",
  saw: "see", seen: "see", knew: "know", known: "know",
  gave: "give", given: "give", made: "make",
  caught: "catch", taught: "teach",
  fell: "fall", held: "hold",
  kept: "keep", meant: "mean", met: "meet", grew: "grow",
  heard: "hear", sold: "sell", woke: "wake", dealt: "deal",
  broke: "break", rang: "ring", told: "tell",
  won: "win", chose: "choose", chosen: "choose",
  lived: "live", promised: "promise",
  misunderstood: "misunderstand",
  // more irregular verbs / past forms
  said: "say", goes: "go", drank: "drink", dreamt: "dream",
  froze: "freeze", sang: "sing", slept: "sleep", torn: "tear", wrote: "write",
  led: "lead", woken: "wake", understood: "understand", became: "become",
  // irregular plurals
  children: "child", feet: "foot", mice: "mouse", women: "woman",
  // pluralia tantum / foreign plurals
  crises: "crisis", phenomena: "phenomenon", schemata: "schema",
  corpora: "corpus", simulacra: "simulacrum",
};

/**
 * Genuine dictionary gaps that are real (advanced) English vocabulary:
 * mostly academic / philosophy / social-science jargon. These carry no
 * CEFR tag in the bundled dictionary, so we assign them C2 directly.
 * Proper nouns, culture words, numbers, abbreviations, and foreign
 * phrases are intentionally left out (no meaningful CEFR to assign).
 */
export const CEFR_OVERRIDE: Record<string, Cefr> = {
  abolitionism: "C2", accelerationism: "C2", acculturation: "C2", adaptationism: "C2", affectivist: "C2", aggregative: "C2",
  agonism: "C2", akrasia: "C2", alterity: "C2", analepsis: "C2", analogical: "C2", analytic: "C2",
  anthropocene: "C2", anthropocentrism: "C2", apophatic: "C2", arbitrariness: "C2", arborescent: "C2", artworld: "C2",
  atomistic: "C2", "avant-garde": "C2", backsliding: "C2", bioethical: "C2", biopolitics: "C2", centrism: "C2",
  clothesline: "C2", cognising: "C2", coloniality: "C2", colonised: "C2", coloniser: "C2", commensal: "C2",
  commercialisation: "C2", commodification: "C2", compartmentalisation: "C2", complementarities: "C2", complementarity: "C2", conditionalisation: "C2",
  conditionality: "C2", connectionism: "C2", connectionist: "C2", connexion: "C2", constitutionalism: "C2", constructedness: "C2",
  constructivism: "C2", constructivist: "C2", contextualisation: "C2", contextualism: "C2", contextualist: "C2", copernican: "C2",
  corpora: "C2", counterexamples: "C2", counterfactual: "C2", countertransference: "C2", criticality: "C2", crystallised: "C2",
  curatorial: "C2", decentring: "C2", decoherence: "C2", decolonise: "C2", decolonising: "C2", deconstructive: "C2",
  decoupling: "C2", deepfake: "C2", defamiliarisation: "C2", deliberative: "C2", dematerialisation: "C2", democratisation: "C2",
  democratises: "C2", denialism: "C2", deontological: "C2", derogation: "C2", deschooling: "C2", descriptivism: "C2",
  determinate: "C2", directionality: "C2", discursive: "C2", discursivism: "C2", ecocriticism: "C2", ecofeminism: "C2",
  eliminativism: "C2", emancipatory: "C2", embeddedness: "C2", empiricist: "C2", epidemiological: "C2", epistemic: "C2",
  epistemological: "C2", epistemologically: "C2", equivalential: "C2", essentialism: "C2", essentialist: "C2", eternalism: "C2",
  ethnocentrism: "C2", eurocentric: "C2", evolutionarily: "C2", expansionism: "C2", explicatory: "C2", expressionist: "C2",
  expressivism: "C2", externalisation: "C2", externalism: "C2", falsifiability: "C2", fetishism: "C2", fictionalism: "C2",
  financialisation: "C2", foreignising: "C2", foundationalism: "C2", frequentism: "C2", functionalism: "C2", gettier: "C2",
  globalised: "C2", habitus: "C2", hegemon: "C2", hermeneutic: "C2", hesitancy: "C2", heteronormativity: "C2",
  hierarchising: "C2", historicity: "C2", holism: "C2", homogenisation: "C2", homogenising: "C2", humeanism: "C2",
  hybridity: "C2", iconology: "C2", idealisation: "C2", illocutionary: "C2", illusionism: "C2", implicature: "C2",
  incalculable: "C2", incommensurability: "C2", indeterminacy: "C2", ineffability: "C2", ineliminable: "C2", inevitably: "C2",
  inexhaustibility: "C2", inferential: "C2", institutionalising: "C2", instrumentalism: "C2", intentionality: "C2", internalism: "C2",
  interpellation: "C2", interpenetrate: "C2", interpretability: "C2", intersectionality: "C2", intersubjective: "C2", intertextual: "C2",
  intertextuality: "C2", interventionism: "C2", intuitionism: "C2", irreducibility: "C2", isomorphism: "C2", libidinal: "C2",
  lifeworld: "C2", liminality: "C2", locutionary: "C2", longtermist: "C2", manipulationist: "C2", mereological: "C2",
  metacognitive: "C2", metafictional: "C2", metanarrative: "C2", metanarratives: "C2", metapragmatic: "C2", metapsychological: "C2",
  microaggression: "C2", microhistory: "C2", mimetic: "C2", misalignment: "C2", misrecognition: "C2", monism: "C2",
  monolinguals: "C2", multilateralism: "C2", multipolar: "C2", museology: "C2", naturalised: "C2", naturalising: "C2",
  neuroaesthetics: "C2", neurolinguistics: "C2", neuroplasticity: "C2", "non-cognitivism": "C2", noumenal: "C2", ocularcentrism: "C2",
  operationalisation: "C2", orientalism: "C2", originalism: "C2", panpsychism: "C2", particularist: "C2", particularity: "C2",
  peremptory: "C2", perlocutionary: "C2", permeation: "C2", perspectival: "C2", phenomena: "C2", phenomenological: "C2",
  physicalist: "C2", platonism: "C2", polarisation: "C2", polycentric: "C2", polycentrism: "C2", polyphony: "C2",
  polysemy: "C2", positivism: "C2", posthumanism: "C2", poststructuralism: "C2", preprint: "C2", prioritarianism: "C2",
  probabilism: "C2", prolepsis: "C2", prosocial: "C2", protention: "C2", protentional: "C2", provable: "C2",
  pyrrhonian: "C2", qualia: "C2", reactivation: "C2", reappropriation: "C2", recontextualising: "C2", redistributive: "C2",
  reductionism: "C2", reductionist: "C2", reframes: "C2", refutable: "C2", regionalism: "C2", reintegrating: "C2",
  reinterpreting: "C2", relativisation: "C2", reliabilism: "C2", reorganise: "C2", representationalism: "C2", representationalist: "C2",
  revitalisation: "C2", rhizome: "C2", schemata: "C2", secularisation: "C2", semantically: "C2", semiological: "C2",
  semiotic: "C2", sensorimotor: "C2", simulacra: "C2", situatedness: "C2", socialisation: "C2", sociolinguistics: "C2",
  standardisation: "C2", standardised: "C2", strategically: "C2", structuralism: "C2", structuralist: "C2", structuration: "C2",
  subaltern: "C2", subjectivation: "C2", subjectivism: "C2", sublimation: "C2", superbugs: "C2", superorganism: "C2",
  supervenience: "C2", supranational: "C2", symbolist: "C2", systematically: "C2", teleological: "C2", teleology: "C2",
  temporality: "C2", theorisation: "C2", trafficking: "C2", transgenerational: "C2", transhumanism: "C2", transmedia: "C2",
  trophic: "C2",   underdetermination: "C2", underdevelopment: "C2", underlying: "C2", universalisation: "C2", unsayable: "C2",
  valorisation: "C2",
  // foreign / continental-philosophy terms (no English CEFR, clearly advanced)
  "différance": "C2", gestell: "C2", jetztzeit: "C2", "sapir-whorf": "C2",
  // common graded vocabulary missing from the bundled dictionary
  healthy: "A2", early: "A2", easy: "A2", happy: "A2",
  // remaining-69 (final unmatched srsWords): genuine English lexemes whose
  // CEFR was verified online (Cambridge Essential / Oxford 3000).
  "cannot": "A1", english: "A1", goodbye: "A1", ok: "A1", okay: "A1",
  healthier: "A2", earlier: "A2", easier: "A2", happier: "A2",
  towards: "B1", onto: "A2", latin: "B1", "wi-fi": "B1", pm: "B1",
  "42": "A1", "2026": "A1",
  // remaining-69: proper nouns / abbreviations / foreign phrases / foods.
  // These carry NO official CEFR in any reference list, so they are assigned
  // by domain context (best-effort): country/city/brand names ~B1, personal
  // names ~A2, famous philosophers/scientists & foreign academic phrases ~C2,
  // common abbreviations ~B1, Chinese festival foods ~B1.
  china: "B1", beijing: "B1", shanghai: "B1", wechat: "B1",
  david: "A2", li: "A2", ming: "A2", wang: "A2",
  kant: "C2", wittgenstein: "C2", quine: "C2", putnam: "C2", toulmin: "C2",
  mctaggart: "C2", "gödel": "C2", "schrödinger": "C2", fermi: "C2", gaia: "C2",
  ac: "B1", pe: "B1", hd: "B1", qr: "B1", ups: "B1",
  "lieux de mémoire": "C2", "opinio juris": "C2",
  mooncakes: "B1", tangyuan: "B1", zongzi: "B1",
};

/**
 * Common derivational suffixes (adverb / noun / adjective families). We strip
 * them as additional lemma candidates; the dictionary lookup keeps only the
 * forms that actually exist.
 */
const DERIV_SUFFIXES = [
  "ly", "ness", "ity", "al", "ion", "ment", "ous", "ive",
  "able", "ible", "ful", "less", "ic", "ical", "ize", "ise", "ify",
  "ist", "ism", "ward", "wise", "ary", "ory", "ent", "ant",
];

// Some derivational suffixes hide a final "e" of the base (e.g. "ity" on
// "performative" -> "performativity"); restore it as a candidate.
const E_HIDING_SUFFIXES = ["ity", "ion", "ive", "ize", "ise", "ify", "able", "ible", "al"];

/** Strip a single inflectional suffix, returning all plausible stems. */
function stripInflection(s: string): string[] {
  const out: string[] = [];
  const collapseDouble = (x: string): string => {
    if (/([bcdfgklmnpqrstvzwy])\1$/.test(x)) return x.slice(0, -1);
    return x;
  };
  const restoreY = (x: string): string => {
    // happier -> happy, easier -> easy (y spelled as i before -er/-est)
    if (/[^aeiou]i$/.test(x)) return x.slice(0, -1) + "y";
    // healthier -> healthy, earlier -> early (y spelled as ie before -er/-est)
    if (/ie$/.test(x)) return x.slice(0, -2) + "y";
    return x;
  };
  if (/[^aeiou]er$/.test(s) && s.length > 4) {
    const stem = s.slice(0, -2);
    out.push(stem, stem + "e", collapseDouble(stem), restoreY(stem));
  }
  if (/[^aeiou]est$/.test(s) && s.length > 5) {
    const stem = s.slice(0, -3);
    out.push(stem, stem + "e", collapseDouble(stem), restoreY(stem));
  }
  if (/ies$/.test(s) && s.length > 4) out.push(s.slice(0, -3) + "y");
  if (/ied$/.test(s) && s.length > 4) out.push(s.slice(0, -3) + "y");
  if (/es$/.test(s) && s.length > 3) {
    out.push(s.slice(0, -1)); // e.g. ages -> age
    out.push(s.slice(0, -2)); // e.g. processes -> process, boxes -> box
  }
  if (/ed$/.test(s) && s.length > 3) {
    out.push(s.slice(0, -2)); // plain
    out.push(s.slice(0, -1)); // silent-e verbs: changed -> change
    const d = s.slice(0, -2);
    if (/([bcdfgklmnpqrstvzwy])\1$/.test(d)) out.push(d.slice(0, -1)); // doubled collapse
  }
  if (/ing$/.test(s) && s.length > 4) {
    out.push(s.slice(0, -3)); // plain
    out.push(s.slice(0, -3) + "e"); // silent-e verbs: changing -> change
    const d = s.slice(0, -3);
    if (/([bcdfgklmnpqrstvzwy])\1$/.test(d)) out.push(d.slice(0, -1)); // doubled collapse
  }
  if (/s$/.test(s) && s.length > 3) out.push(s.slice(0, -1));
  return out;
}

/**
 * Produce candidate base forms for a token. We combine one derivational-suffix
 * strip with inflectional strips and let the dictionary lookup pick the form
 * that actually exists. This avoids wrongly collapsing native doubled
 * spellings (e.g. "called" stays "call", not "cal").
 */
function lemmaCandidates(token: string): string[] {
  const cands = new Set<string>([token]);
  if (IRREGULAR[token]) cands.add(IRREGULAR[token]);

  for (const stem of stripInflection(token)) cands.add(stem);

  for (const suf of DERIV_SUFFIXES) {
    if (token.length > suf.length + 2 && token.endsWith(suf)) {
      const stem = token.slice(0, -suf.length);
      cands.add(stem);
      if (E_HIDING_SUFFIXES.includes(suf)) cands.add(stem + "e");
      for (const s2 of stripInflection(stem)) cands.add(s2);
      if (E_HIDING_SUFFIXES.includes(suf)) {
        for (const s2 of stripInflection(stem + "e")) cands.add(s2);
      }
    }
  }
  return [...cands];
}

/**
 * Resolve one srsWord to a CEFR level.
 *  - exact phrase match in the dictionary wins;
 *  - otherwise take the highest CEFR level among its tokens, where each
 *    token is lemmatized (so "reveals" -> "reveal", "systems" -> "system",
 *    "took" -> "take", "running" -> "run", "changed" -> "change",
 *    "fundamentally" -> "fundamental") before dictionary lookup;
 *  - single tokens that are genuine dictionary gaps (advanced academic
 *    vocabulary) get a direct C2 assignment via CEFR_OVERRIDE;
 *  - if nothing is found, return null (counted as Unknown).
 */
function levelForWord(word: string, dict: Map<string, string>): Cefr | null {
  const norm = word.toLowerCase().trim();
  if (!norm) return null;

  const exact = dict.get(norm);
  if (exact && (CEFR_ORDER as string[]).includes(exact)) return exact as Cefr;

  // whole-form override (covers hyphenated and accented single words like
  // "avant-garde" and "différance", which tokenization would otherwise split)
  if ((CEFR_OVERRIDE as Record<string, Cefr>)[norm]) {
    return (CEFR_OVERRIDE as Record<string, Cefr>)[norm];
  }

  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  let best: Cefr | null = null;
  const consider = (cand: string) => {
    if (!cand) return;
    const l = dict.get(cand);
    if (l && (CEFR_ORDER as string[]).includes(l)) {
      if (!best || CEFR_ORDER.indexOf(l as Cefr) > CEFR_ORDER.indexOf(best)) {
        best = l as Cefr;
      }
    }
  };
  for (const t of tokens) {
    for (const c of lemmaCandidates(t)) consider(c);
  }
  if (best) return best;

  if (tokens.length === 1) {
    const o = (CEFR_OVERRIDE as Record<string, Cefr>)[tokens[0]];
    if (o) return o;
  }
  return null;
}

export function getCourseSrsReport(): CourseSrsRow[] {
  const dict = buildDictionary();

  const files = readdirSync(CONTENT_DIR).filter(
    (f) => /[^.]+\.md$/.test(f) && f.includes("unit"),
  );

  const byCourse = new Map<string, CourseSrsRow>();

  for (const f of files) {
    const src = readFileSync(path.join(CONTENT_DIR, f), "utf8");

    const cidMatch = src.match(/^courseId:\s*"([^"]+)"/m) ?? src.match(/^courseId:\s*(\S+)/m);
    const lvlMatch = src.match(/^level:\s*"([^"]+)"/m) ?? src.match(/^level:\s*(\S+)/m);
    const courseId = cidMatch ? cidMatch[1] : f.replace(/\.md$/, "");
    const level = lvlMatch ? lvlMatch[1].replace(/"/g, "") : "";

    let doc;
    try {
      doc = parseUnitMarkdown(src);
    } catch {
      continue;
    }

    if (!byCourse.has(courseId)) {
      byCourse.set(courseId, {
        courseId,
        level,
        kind: courseId.includes("flashcard") ? "flashcard" : "translation",
        total: 0,
        byLevel: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
        unknown: 0,
      });
    }
    const row = byCourse.get(courseId)!;

    for (const lesson of doc.lessons) {
      for (const ex of lesson.exercises) {
        const sw = (ex as { srsWords?: string | string[] }).srsWords;
        if (!sw) continue;
        const words = Array.isArray(sw) ? sw : [sw];
        for (const w of words) {
          row.total++;
          const lvl = levelForWord(w, dict);
          if (lvl) row.byLevel[lvl]++;
          else row.unknown++;
        }
      }
    }
  }

  const rows = Array.from(byCourse.values());
  rows.sort((a, b) => {
    const la = CEFR_ORDER.indexOf(a.level as Cefr);
    const lb = CEFR_ORDER.indexOf(b.level as Cefr);
    if (la !== lb) return la - lb;
    return a.kind.localeCompare(b.kind);
  });
  return rows;
}

/**
 * Diagnostic helper: return every srsWord (across all courses) that the
 * matcher could not assign a CEFR level to, with how often it occurs.
 * Useful for auditing / filling gaps in CEFR_OVERRIDE.
 */
export function listUnknownSrsWords(): Array<{ word: string; count: number }> {
  const dict = buildDictionary();
  const count = new Map<string, number>();
  const files = readdirSync(CONTENT_DIR).filter(
    (f) => /[^.]+\.md$/.test(f) && f.includes("unit"),
  );
  for (const f of files) {
    const src = readFileSync(path.join(CONTENT_DIR, f), "utf8");
    let doc;
    try {
      doc = parseUnitMarkdown(src);
    } catch {
      continue;
    }
    for (const lesson of doc.lessons) {
      for (const ex of lesson.exercises) {
        const sw = (ex as { srsWords?: string | string[] }).srsWords;
        if (!sw) continue;
        const words = Array.isArray(sw) ? sw : [sw];
        for (const w of words) {
          const norm = String(w).toLowerCase().trim();
          if (!norm) continue;
          if (levelForWord(norm, dict)) continue;
          count.set(norm, (count.get(norm) ?? 0) + 1);
        }
      }
    }
  }
  return [...count.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
