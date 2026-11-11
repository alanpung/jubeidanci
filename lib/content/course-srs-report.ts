/**
 * Owner-only report: SRS-word counts per course, bucketed by the dictionary's
 * real CEFR level (A1–C2) plus an "Unknown" bucket for words/phrases that are
 * not found in the bundled English dictionary.
 *
 * Counts are de-duplicated: a word used by many exercises inside the same
 * course is counted once for that course. The same word appearing in two
 * different courses is counted once in each (courses are independent), so the
 * footer rows distinguish "sum of per-course distinct" from the globally
 * distinct total.
 *
 * This reads the committed `content/*.md` unit files directly (the source of
 * truth for `srsWords`) rather than the DB-backed course copies, so it reflects
 * what will ship. It is gated to the owner in the page that calls it.
 */

import { readdirSync, readFileSync } from "fs";
import path from "path";

import { parseUnitMarkdown } from "./unit-parser";
import { normalizeQuestionType } from "./question-types";

const CONTENT_DIR = path.join(process.cwd(), "content");
const DICT_PATH = path.join(process.cwd(), "words", "english_merged.json");

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const CEFR_ORDER: Cefr[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface CourseSrsRow {
  courseId: string;
  /** The course's own declared level (A1–C2). */
  level: string;
  /**
   * The course's exercise type id (e.g. "listening", "word-bank"), resolved
   * from the unit frontmatter `questionType`. Null when the unit declares no
   * recognisable type (falls back to a generic label in the UI).
   */
  kind: string | null;
  /** Chinese display name for {@link kind} (e.g. "听力理解"). Empty when unknown. */
  kindLabel: string;
  /** Total DISTINCT srsWords within this course. */
  total: number;
  byLevel: Record<Cefr, number>;
  /** Distinct srsWords (or their tokens) not found in the dictionary. */
  unknown: number;
}

/** Per-course accumulator for the de-duplicated word sets. */
interface CourseAccumulator {
  courseId: string;
  level: string;
  kind: string | null;
  kindLabel: string;
  /** Every distinct srsWord seen in this course. */
  all: Set<string>;
  /** Distinct words bucketed by their resolved CEFR level. */
  byLevel: Record<Cefr, Set<string>>;
  /** Distinct words with no CEFR level. */
  unknown: Set<string>;
}

let _dictionaryCache: Map<string, string> | null = null;

/**
 * Build the base CEFR dictionary (word -> level) from words/english_merged.json.
 * Cached module-level so the 8MB JSON is parsed at most once per process — this
 * is also the single source of truth reused by the SRS library/seed paths via
 * {@link levelForWord}.
 */
export function buildDictionary(): Map<string, string> {
  if (_dictionaryCache) return _dictionaryCache;
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
    _dictionaryCache = m;
    return m;
  } catch {
    return _dictionaryCache ?? new Map();
  }
}

/**
 * Irregular / tricky inflections that a rule-based lemmatizer misses.
 * Maps the inflected surface form -> its dictionary base form.
 */
export const IRREGULAR: Record<string, string> = {
  // added: inflected surface forms resolving to a dictionary base
  'ate': 'eat',
  'became': 'become',
  'began': 'begin',
  'biggest': 'big',
  'blew': 'blow',
  'blown': 'blow',
  'born': 'bear',
  'bought': 'buy',
  'broke': 'break',
  'brought': 'bring',
  'built': 'build',
  'burned': 'burn',
  'burnt': 'burn',
  'came': 'come',
  'caught': 'catch',
  'charitably': 'charitable',
  'cheapest': 'cheap',
  'children': 'child',
  'chose': 'choose',
  'chosen': 'choose',
  'corpora': 'corpus',
  'crises': 'crisis',
  'darkest': 'dark',
  'dealt': 'deal',
  'drank': 'drink',
  'drawn': 'draw',
  'dreamt': 'dream',
  'drew': 'draw',
  'driven': 'drive',
  'drove': 'drive',
  'earliest': 'early',
  'eaten': 'eat',
  'feet': 'foot',
  'fell': 'fall',
  'felt': 'feel',
  'fishermen': 'fisherman',
  'flew': 'fly',
  'forgiven': 'forgive',
  'forgot': 'forget',
  'forgotten': 'forget',
  'fought': 'fight',
  'froze': 'freeze',
  'gave': 'give',
  'given': 'give',
  'goes': 'go',
  'gone': 'go',
  'grandchildren': 'grandchild',
  'greatest': 'great',
  'grew': 'grow',
  'grown': 'grow',
  'happiest': 'happy',
  'hardest': 'hard',
  'heard': 'hear',
  'heaviest': 'heavy',
  'held': 'hold',
  'hottest': 'hot',
  'kept': 'keep',
  'knew': 'know',
  'known': 'know',
  'laid': 'lay',
  'learnt': 'learn',
  'led': 'lead',
  'lent': 'lend',
  'lit': 'light',
  'lived': 'live',
  'loudest': 'loud',
  'made': 'make',
  'meant': 'mean',
  'met': 'meet',
  'mice': 'mouse',
  'mildest': 'mild',
  'misunderstood': 'misunderstand',
  'nearest': 'near',
  'outgrown': 'outgrow',
  'overcame': 'overcome',
  'overthrown': 'overthrow',
  'personalisation': 'personalise',
  'phenomena': 'phenomenon',
  'picnicked': 'picnic',
  'promised': 'promise',
  'rang': 'ring',
  'rebuilt': 'rebuild',
  'retold': 'retell',
  'richest': 'rich',
  'risen': 'rise',
  'rode': 'ride',
  'said': 'say',
  'saltier': 'salty',
  'sang': 'sing',
  'sat': 'sit',
  'saw': 'see',
  'schemata': 'schema',
  'seen': 'see',
  'sent': 'send',
  'shown': 'show',
  'simulacra': 'simulacrum',
  'slept': 'sleep',
  'smallest': 'small',
  'sold': 'sell',
  'sought': 'seek',
  'spent': 'spend',
  'spoke': 'speak',
  'spoken': 'speak',
  'stood': 'stand',
  'struck': 'strike',
  'swam': 'swim',
  'swore': 'swear',
  'swum': 'swim',
  'taken': 'take',
  'taught': 'teach',
  'thought': 'think',
  'threw': 'throw',
  'thrown': 'throw',
  'told': 'tell',
  'took': 'take',
  'torn': 'tear',
  'truest': 'true',
  'understood': 'understand',
  'upheld': 'uphold',
  'went': 'go',
  'withdrew': 'withdraw',
  'woke': 'wake',
  'woken': 'wake',
  'women': 'woman',
  'won': 'win',
  'wore': 'wear',
  'wrote': 'write',
};

/**
 * Genuine dictionary gaps that are real (advanced) English vocabulary:
 * mostly academic / philosophy / social-science jargon. These carry no
 * CEFR tag in the bundled dictionary, so we assign them C2 directly.
 * Proper nouns, culture words, numbers, abbreviations, and foreign
 * phrases are intentionally left out (no meaningful CEFR to assign).
 */
export const CEFR_OVERRIDE: Record<string, Cefr> = {
  // added: contractions, proper nouns, possessives and genuine dictionary gaps
  'abolitionism': 'C2',
  'accelerationism': 'C2',
  'acculturation': 'C2',
  'adaptationism': 'C2',
  'affectivist': 'C2',
  'africa': 'A1',
  'aggregative': 'C2',
  'agonism': 'C2',
  'akrasia': 'C2',
  'aladdin': 'A1',
  'alan': 'A1',
  'albert': 'A1',
  'algae': 'B1',
  'alterity': 'C2',
  'analepsis': 'C2',
  'analogical': 'C2',
  'analytic': 'C2',
  'anthropocene': 'C2',
  'anthropocentrism': 'C2',
  'apophatic': 'C2',
  'arbitrariness': 'C2',
  'arborescent': 'C2',
  'argot': 'C1',
  'arguendo': 'C2',
  'artworld': 'C2',
  'athena': 'A1',
  'atomistic': 'C2',
  'avant-garde': 'C2',
  'backsliding': 'C2',
  'beethoven': 'A1',
  'bioethical': 'C2',
  'biopolitics': 'C2',
  'birmingham': 'A1',
  'brazil': 'A1',
  'california': 'A1',
  'canada': 'A1',
  'candour': 'B2',
  'caribbean': 'A1',
  'centrism': 'C2',
  'chris': 'A1',
  'christmas': 'A1',
  'clothesline': 'C2',
  'cognising': 'C2',
  'coloniality': 'C2',
  'colonised': 'C2',
  'coloniser': 'C2',
  'commensal': 'C2',
  'commercialisation': 'C2',
  'commodification': 'C2',
  'compartmentalisation': 'C2',
  'complementarities': 'C2',
  'complementarity': 'C2',
  'conditionalisation': 'C2',
  'conditionality': 'C2',
  'conflate': 'C1',
  'conflating': 'C1',
  'connectionism': 'C2',
  'connectionist': 'C2',
  'connexion': 'C2',
  'constitutionalism': 'C2',
  'constructedness': 'C2',
  'constructivism': 'C2',
  'constructivist': 'C2',
  'contextualisation': 'C2',
  'contextualism': 'C2',
  'contextualist': 'C2',
  'copernican': 'C2',
  'corpora': 'C2',
  "couldn't": 'A1',
  'counterargument': 'C1',
  'counterexamples': 'C2',
  'counterfactual': 'C2',
  'countertransference': 'C2',
  'counterview': 'C1',
  'criticality': 'C2',
  'crystallised': 'C2',
  'curatorial': 'C2',
  'dale': 'A1',
  'davis': 'A1',
  'decentring': 'C2',
  'decoherence': 'C2',
  'decolonise': 'C2',
  'decolonising': 'C2',
  'deconstructive': 'C2',
  'decoupling': 'C2',
  'deepfake': 'C2',
  'defamiliarisation': 'C2',
  'defeasibility': 'C2',
  'deliberative': 'C2',
  'dematerialisation': 'C2',
  'democratisation': 'C2',
  'democratises': 'C2',
  'denialism': 'C2',
  'deontological': 'C2',
  'derogation': 'C2',
  'deschooling': 'C2',
  'descriptivism': 'C2',
  'determinate': 'C2',
  "didn't": 'A1',
  'différance': 'C2',
  'directionality': 'C2',
  'discursive': 'C2',
  'discursivism': 'C2',
  "doesn't": 'A1',
  'dubai': 'A1',
  'ecocriticism': 'C2',
  'ecofeminism': 'C2',
  'edinburgh': 'A1',
  'eiffel': 'A1',
  'elides': 'C1',
  'eliminativism': 'C2',
  'emancipatory': 'C2',
  'embeddedness': 'C2',
  'empiricist': 'C2',
  'england': 'A1',
  'epidemiological': 'C2',
  'epistemic': 'C2',
  'epistemological': 'C2',
  'epistemologically': 'C2',
  'equivalential': 'C2',
  'essentialism': 'C2',
  'essentialist': 'C2',
  'eternalism': 'C2',
  'ethnocentrism': 'C2',
  'eurocentric': 'C2',
  'evolutionarily': 'C2',
  'expansionism': 'C2',
  'explicatory': 'C2',
  'expressionist': 'C2',
  'expressivism': 'C2',
  'externalisation': 'C2',
  'externalism': 'C2',
  'falsifiability': 'C2',
  'fetishism': 'C2',
  'fictionalism': 'C2',
  'financialisation': 'C2',
  'finitude': 'C2',
  'forcibly': 'B2',
  'foreignising': 'C2',
  'foundationalism': 'C2',
  'france': 'A1',
  'franz': 'A1',
  'frequentism': 'C2',
  'functionalism': 'C2',
  'gabriel': 'A1',
  'gatepost': 'B2',
  'generalisation': 'C1',
  'gentrified': 'C1',
  'gestell': 'C2',
  'gettier': 'C2',
  'globalised': 'C2',
  'grammaticalisation': 'C1',
  'greek': 'A1',
  'greenwashed': 'B2',
  'habitus': 'C2',
  "hadn't": 'A1',
  'harvard': 'A1',
  'hegemon': 'C2',
  'hermeneutic': 'C2',
  'hesitancy': 'C2',
  'heteronormativity': 'C2',
  'hierarchising': 'C2',
  'historicity': 'C2',
  'holism': 'C2',
  'homogenisation': 'C2',
  'homogenising': 'C2',
  'hong kong': 'A1',
  'humeanism': 'C2',
  'hybridity': 'C2',
  'iconology': 'C2',
  'idealisation': 'C2',
  'illocutionary': 'C2',
  'illusionism': 'C2',
  'implicature': 'C2',
  'incalculable': 'C2',
  'incommensurability': 'C2',
  'indeterminacy': 'C2',
  'india': 'A1',
  'ineffability': 'C2',
  'ineliminable': 'C2',
  'inevitably': 'C2',
  'inexhaustibility': 'C2',
  'inferential': 'C2',
  'institutionalising': 'C2',
  'instrumentalism': 'C2',
  'intentionality': 'C2',
  'internalism': 'C2',
  'interpellation': 'C2',
  'interpenetrate': 'C2',
  'interpretability': 'C2',
  'intersectionality': 'C2',
  'intersubjective': 'C2',
  'intertextual': 'C2',
  'intertextuality': 'C2',
  'interventionism': 'C2',
  'intuitionism': 'C2',
  'irreducibility': 'C2',
  "isn't": 'A1',
  'isomorphism': 'C2',
  'italian': 'A1',
  'italy': 'A1',
  'japan': 'A1',
  'jesus': 'A1',
  'jetztzeit': 'C2',
  'jones': 'A1',
  'korean': 'A1',
  'libidinal': 'C2',
  'lifeworld': 'C2',
  'liminality': 'C2',
  'liveability': 'B1',
  'locutionary': 'C2',
  'london': 'A1',
  'longtermist': 'C2',
  'lyon': 'A1',
  'manchester': 'A1',
  'manipulationist': 'C2',
  'maria': 'A1',
  'marx': 'A1',
  'matengu': 'A1',
  'medicalised': 'B1',
  'mereological': 'C2',
  'meritocracy': 'C1',
  'metacognitive': 'C2',
  'metafictional': 'C2',
  'metanarrative': 'C2',
  'metanarratives': 'C2',
  'metapragmatic': 'C2',
  'metapsychological': 'C2',
  'mexico': 'A1',
  'microaggression': 'C2',
  'microhistory': 'C2',
  'mimetic': 'C2',
  'misalignment': 'C2',
  'misrecognition': 'C2',
  'monism': 'C2',
  'monoculture': 'C1',
  'monolinguals': 'C2',
  'multilateralism': 'C2',
  'multipolar': 'C2',
  'museology': 'C2',
  'nasa': 'A1',
  'naturalised': 'C2',
  'naturalising': 'C2',
  'neuroaesthetics': 'C2',
  'neurolinguistics': 'C2',
  'neuroplasticity': 'C2',
  'non-cognitivism': 'C2',
  'nonchalance': 'C1',
  'noumenal': 'C2',
  'occludes': 'C1',
  'ocularcentrism': 'C2',
  'operationalisation': 'C2',
  'orientalism': 'C2',
  'originalism': 'C2',
  'ought': 'A2',
  'overprotect': 'B2',
  'overripe': 'B1',
  'pablo': 'A1',
  'panpsychism': 'C2',
  'paris': 'A1',
  'particularist': 'C2',
  'particularity': 'C2',
  'patois': 'C1',
  'pedestrianised': 'B1',
  'peremptory': 'C2',
  'perlocutionary': 'C2',
  'permeation': 'C2',
  'perspectival': 'C2',
  'phenomena': 'C2',
  'phenomenological': 'C2',
  'physicalist': 'C2',
  'platonism': 'C2',
  'polarisation': 'C2',
  'polycentric': 'C2',
  'polycentrism': 'C2',
  'polyphony': 'C2',
  'polysemy': 'C2',
  'positivism': 'C2',
  'posthumanism': 'C2',
  'poststructuralism': 'C2',
  'precarity': 'C1',
  'preprint': 'C2',
  'prioritarianism': 'C2',
  'probabilism': 'C2',
  'prolepsis': 'C2',
  'prosocial': 'C2',
  'protention': 'C2',
  'protentional': 'C2',
  'provable': 'C2',
  'pyrrhonian': 'C2',
  'qualia': 'C2',
  'rarefied': 'C1',
  'reactivation': 'C2',
  'reappropriation': 'C2',
  'rebook': 'B1',
  'recontextualising': 'C2',
  'redistributive': 'C2',
  'reductionism': 'C2',
  'reductionist': 'C2',
  'reframe': 'C1',
  'reframes': 'C2',
  'reframing': 'C1',
  'refutable': 'C2',
  'regionalism': 'C2',
  'reintegrating': 'C2',
  'reinterpreting': 'C2',
  'relativisation': 'C2',
  'reliabilism': 'C2',
  'reorganise': 'C2',
  'representationalism': 'C2',
  'representationalist': 'C2',
  'revitalisation': 'C2',
  'rewild': 'B1',
  'rhizome': 'C2',
  'rightsizing': 'C1',
  'roman': 'A1',
  'romanticised': 'C1',
  'romanticising': 'C1',
  'rome': 'A1',
  'sahara': 'A1',
  'santa': 'A1',
  "santa's": 'A1',
  'sapir-whorf': 'C2',
  'sceptic': 'B2',
  'schemata': 'C2',
  'schmidt': 'A1',
  'secularisation': 'C2',
  'semantically': 'C2',
  'semiological': 'C2',
  'semiotic': 'C2',
  'sensorimotor': 'C2',
  'simulacra': 'C2',
  'situatedness': 'C2',
  'sixth': 'A1',
  'socialisation': 'C2',
  'sociolinguistics': 'C2',
  'socrates': 'A1',
  'sommelier': 'C1',
  "sommelier's": 'C1',
  'spain': 'A1',
  'spanish': 'A1',
  'sprig': 'B1',
  'standardisation': 'C2',
  'standardised': 'C2',
  'steve': 'A1',
  'strata': 'C1',
  'strategically': 'C2',
  'structuralism': 'C2',
  'structuralist': 'C2',
  'structuration': 'C2',
  'subaltern': 'C2',
  'subjectivation': 'C2',
  'subjectivism': 'C2',
  'sublimation': 'C2',
  'superbugs': 'C2',
  'superman': 'B1',
  'superorganism': 'C2',
  'supervenience': 'C2',
  'supranational': 'C2',
  'symbolist': 'C2',
  'systematically': 'C2',
  'teleological': 'C2',
  'teleology': 'C2',
  'temporality': 'C2',
  'theorisation': 'C2',
  'tiramisu': 'A1',
  'tokyo': 'A1',
  'tom': 'A1',
  'trafficking': 'C2',
  'transgenerational': 'C2',
  'transhumanism': 'C2',
  'transmedia': 'C2',
  'trophic': 'C2',
  'twinges': 'B1',
  'underdetermination': 'C2',
  'underdevelopment': 'C2',
  'underlying': 'C2',
  'unexamined': 'B2',
  'unglamorous': 'C1',
  'unhurried': 'B2',
  'universalisation': 'C2',
  'unlearn': 'B2',
  'unmindful': 'C1',
  'unsayable': 'C2',
  'unseasonably': 'B2',
  'untranslatable': 'C1',
  'valorisation': 'C2',
  "wasn't": 'A1',
  'westminster': 'A1',
  'william': 'A1',
  "wouldn't": 'A2',
  'york': 'A1',
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
export function levelForWord(word: string, dict: Map<string, string>): Cefr | null {
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

export interface CourseSrsUnique {
  byLevel: Record<Cefr, number>;
  unknown: number;
  total: number;
}

/**
 * Optional filter for {@link getCourseSrsReport}. Lists are OR within
 * themselves; a course must satisfy EVERY active list to be included.
 */
export interface CourseSrsFilter {
  /** Course CEFR levels to keep (e.g. ["A2","B1"]). Empty/omitted = all. */
  levels?: string[];
  /**
   * Course question-type ids to keep (e.g. ["speaking","flashcard-review"]).
   * Empty/omitted = all. A course with no recognised type never matches a
   * non-empty `kinds` list.
   */
  kinds?: string[];
}

export interface CourseSrsReport {
  rows: CourseSrsRow[];
  unique: CourseSrsUnique;
  /** Every distinct course type present in the data (id + Chinese label). */
  availableKinds: { id: string; label: string }[];
  /** Every distinct CEFR level present in the data, in CEFR order. */
  availableLevels: string[];
}

export function getCourseSrsReport(
  filter?: CourseSrsFilter,
): CourseSrsReport {
  const dict = buildDictionary();

  const files = readdirSync(CONTENT_DIR).filter(
    (f) => /[^.]+\.md$/.test(f) && f.includes("unit"),
  );

  const byCourse = new Map<string, CourseAccumulator>();

  for (const f of files) {
    const src = readFileSync(path.join(CONTENT_DIR, f), "utf8");

    const cidMatch = src.match(/^courseId:\s*"([^"]+)"/m) ?? src.match(/^courseId:\s*(\S+)/m);
    const lvlMatch = src.match(/^level:\s*"([^"]+)"/m) ?? src.match(/^level:\s*(\S+)/m);
    const qtMatch =
      src.match(/^questionType:\s*"([^"]+)"/m) ??
      src.match(/^questionType:\s*(\S+)/m);
    const courseId = cidMatch ? cidMatch[1] : f.replace(/\.md$/, "");
    const level = lvlMatch ? lvlMatch[1].replace(/"/g, "") : "";
    // The unit's declared exercise type is the authoritative label source.
    // Fall back to the course id only when the frontmatter omits it.
    const declaredType = qtMatch
      ? normalizeQuestionType(qtMatch[1])
      : normalizeQuestionType(courseId);

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
        kind: declaredType?.id ?? null,
        kindLabel: declaredType?.nameZh ?? "",
        all: new Set(),
        byLevel: {
          A1: new Set(), A2: new Set(), B1: new Set(),
          B2: new Set(), C1: new Set(), C2: new Set(),
        },
        unknown: new Set(),
      });
    }
    const row = byCourse.get(courseId)!;

    for (const lesson of doc.lessons) {
      for (const ex of lesson.exercises) {
        const sw = (ex as { srsWords?: string | string[] }).srsWords;
        if (!sw) continue;
        const words = Array.isArray(sw) ? sw : [sw];
        for (const w of words) {
          const norm = String(w).toLowerCase().trim();
          if (!norm) continue;
          // De-duplicate WITHIN the course: a word reused across many
          // exercises of the same course counts exactly once.
          if (row.all.has(norm)) continue;
          row.all.add(norm);
          const lvl = levelForWord(w, dict);
          if (lvl) {
            row.byLevel[lvl].add(norm);
          } else {
            row.unknown.add(norm);
          }
        }
      }
    }
  }

  // Enumerate filter options from the FULL data set (independent of the active
  // filter) so the controls stay stable while filtering.
  const kindMap = new Map<string, string>();
  const levelSet = new Set<string>();
  for (const r of byCourse.values()) {
    if (r.kind) kindMap.set(r.kind, r.kindLabel || r.kind);
    if (r.level) levelSet.add(r.level);
  }
  const availableKinds = Array.from(kindMap, ([id, label]) => ({ id, label })).sort(
    (a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"),
  );
  const availableLevels = CEFR_ORDER.filter((l) => levelSet.has(l));

  const levels = (filter?.levels ?? []).filter(Boolean);
  const kinds = (filter?.kinds ?? []).filter(Boolean);
  const passes = (r: CourseAccumulator) => {
    if (levels.length && (!r.level || !levels.includes(r.level))) return false;
    if (kinds.length && (!r.kind || !kinds.includes(r.kind))) return false;
    return true;
  };

  // Per-level / unknown / total DISTINCT sets, de-duplicated across ONLY the
  // courses that pass the filter — this is the filtered "non-overlapping total".
  const uniqueByLevel: Record<Cefr, Set<string>> = {
    A1: new Set(), A2: new Set(), B1: new Set(), B2: new Set(), C1: new Set(), C2: new Set(),
  };
  const uniqueUnknown = new Set<string>();
  const uniqueAll = new Set<string>();

  const rows: CourseSrsRow[] = [];
  for (const r of byCourse.values()) {
    if (!passes(r)) continue;
    for (const w of r.all) uniqueAll.add(w);
    for (const c of CEFR_ORDER) for (const w of r.byLevel[c]) uniqueByLevel[c].add(w);
    for (const w of r.unknown) uniqueUnknown.add(w);

    rows.push({
      courseId: r.courseId,
      level: r.level,
      kind: r.kind,
      kindLabel: r.kindLabel,
      total: r.all.size,
      byLevel: {
        A1: r.byLevel.A1.size,
        A2: r.byLevel.A2.size,
        B1: r.byLevel.B1.size,
        B2: r.byLevel.B2.size,
        C1: r.byLevel.C1.size,
        C2: r.byLevel.C2.size,
      },
      unknown: r.unknown.size,
    });
  }
  rows.sort((a, b) => {
    const la = CEFR_ORDER.indexOf(a.level as Cefr);
    const lb = CEFR_ORDER.indexOf(b.level as Cefr);
    if (la !== lb) return la - lb;
    return (a.kind ?? "").localeCompare(b.kind ?? "");
  });

  const unique: CourseSrsUnique = {
    byLevel: {
      A1: uniqueByLevel.A1.size,
      A2: uniqueByLevel.A2.size,
      B1: uniqueByLevel.B1.size,
      B2: uniqueByLevel.B2.size,
      C1: uniqueByLevel.C1.size,
      C2: uniqueByLevel.C2.size,
    },
    unknown: uniqueUnknown.size,
    total: uniqueAll.size,
  };

  return { rows, unique, availableKinds, availableLevels };
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
