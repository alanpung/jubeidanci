/**
 * Regenerate the B1–C2 CN→EN translation courses from the CEFR-SP corpus.
 *
 * Why this exists:
 *   The previous B1–C2 content was fabricated by an LLM (see the now-retired
 *   generate-b1-c2-translation-courses.mjs). That produced repetitive Chinese
 *   prompts that leaked English topic words (e.g. "在讨论Applying for Jobs时…"),
 *   which is exactly what the course owner complained about.
 *
 *   CEFR-SP (https://github.com/yukiar/CEFR-SP, EMNLP 2022) is a corpus
 *   professionally annotated with CEFR levels (labels 1–6 = A1–C2). We use the
 *   *real* English sentences as the answer and machine-translate them to Chinese
 *   for the prompt, so every sentence is authentic, level-tagged, unique, and
 *   the Chinese prompt is a clean translation (no English words leak in).
 *
 * Output format matches content/a1-translation-*.md exactly so the existing
 * seed pipeline upserts these as public units on the next deploy.
 *
 * Robustness / resume:
 *   - Sentence selection is deterministic (seeded shuffle) and cached to
 *     scripts/.cefr-selection.json so re-runs reproduce the same set.
 *   - Translations are cached to scripts/.cefr-translate-cache.json (en→zh) and
 *     flushed after *every* batch. If the gtx endpoint rate-limits (HTTP 429)
 *     or the process is interrupted, re-running the script resumes from where it
 *     left off — only untranslated sentences are sent.
 *   - Files are written only once EVERY selected sentence has a translation, so
 *     we never emit a half-finished unit.
 *
 * Usage:
 *   node scripts/regenerate-b1-c2-cefr-sp.mjs --data /tmp/CEFR-SP/CEFR-SP --out ./content
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}
const DATA_DIR = getArg("--data", "/tmp/CEFR-SP/CEFR-SP");
const OUT_DIR = path.resolve(ROOT, getArg("--out", "./content"));
const CACHE_DIR = path.join(ROOT, "scripts");
const SELECTION_PATH = path.join(CACHE_DIR, ".cefr-selection.json");
const TRANSLATE_CACHE_PATH = path.join(CACHE_DIR, ".cefr-translate-cache.json");

const LEVEL_INDEX = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

// ---------------------------------------------------------------------------
// Course / unit theming (cosmetic — keeps unit ids stable with the DB)
// ---------------------------------------------------------------------------
const COURSES = [
  {
    level: "B1",
    courseId: "b1-translation-course",
    color: "#3B82F6",
    units: [
      { id: 1, icon: "💼", title: "Work & Career", subtopics: ["Applying for Jobs", "Job Interviews", "Office Routine", "Business Emails", "Team Meetings", "Project Management", "Customer Service", "Salary & Promotion", "Remote Work", "Career Development"] },
      { id: 2, icon: "✈️", title: "Travel & Transportation", subtopics: ["Booking Flights", "At the Airport", "Public Transport", "Renting a Car", "Hotel Check-in", "Sightseeing & Tours", "Asking for Directions", "Travel Emergencies", "Dining Abroad", "Cultural Experience"] },
      { id: 3, icon: "🏥", title: "Health & Fitness", subtopics: ["Visiting the Doctor", "Describing Symptoms", "At the Pharmacy", "Healthy Diet", "Gym & Exercise", "Mental Relaxation", "Medical Insurance", "First Aid", "Sleeping Habits", "Wellness Routines"] },
      { id: 4, icon: "🎓", title: "Education & Learning", subtopics: ["University Life", "Choosing a Major", "Exams & Study", "Online Learning", "Language Acquisition", "Group Projects", "Studying Abroad", "Library Research", "Vocational Training", "Lifelong Learning"] },
      { id: 5, icon: "🏡", title: "Housing & Living", subtopics: ["Renting an Apartment", "House Hunting", "Furniture & Decor", "Home Repairs", "Neighborhood Life", "Roommates & Neighbors", "Utilities & Bills", "Moving House", "Gardening & Household", "Safety at Home"] },
      { id: 6, icon: "🛍️", title: "Shopping & Consumer Life", subtopics: ["Supermarket Shopping", "Buying Clothes", "Online Shopping", "Returns & Refunds", "Budgeting & Saving", "Credit Cards & Banking", "Sales & Discounts", "Consumer Rights", "Electronics & Tech", "Gifts & Celebrations"] },
      { id: 7, icon: "📱", title: "Media & Entertainment", subtopics: ["Watching Movies", "Music & Concerts", "Social Media Use", "News & Current Events", "Video Games", "Reading Books & Blogs", "Podcasts & Streaming", "Celebrity Culture", "Photography", "Art & Museums"] },
      { id: 8, icon: "👥", title: "Relationships & Socializing", subtopics: ["Making New Friends", "Family Gathering", "Dating & Romance", "Resolving Conflicts", "Hosting a Party", "Giving Advice", "Keeping in Touch", "Workplace Friendship", "Social Etiquette", "Expressing Gratitude"] },
      { id: 9, icon: "🌱", title: "Environment & Nature", subtopics: ["Weather & Seasons", "Recycling & Garbage", "Energy Saving", "Animals & Pets", "Parks & Outdoor Life", "Water Conservation", "Local Farming", "Pollution Awareness", "Climate Trends", "Eco-friendly Habits"] },
      { id: 10, icon: "🎯", title: "Future Plans & Ambitions", subtopics: ["Setting Goals", "Saving for the Future", "Dream Jobs", "Starting a Business", "Personal Development", "Work-Life Balance", "Bucket List Travel", "Retirement Plans", "Learning New Skills", "Overcoming Obstacles"] },
    ],
  },
  {
    level: "B2",
    courseId: "b2-translation-course",
    color: "#6366F1",
    units: [
      { id: 1, icon: "👔", title: "Workplace Challenges & Management", subtopics: ["Handling Tight Deadlines", "Conflict Resolution", "Performance Reviews", "Delegating Tasks", "Leadership Dynamics", "Corporate Restructuring", "Negotiating Contracts", "Cross-departmental Cooperation", "Workplace Stress", "Innovation Strategy"] },
      { id: 2, icon: "🌍", title: "Cultural Differences & Exchange", subtopics: ["Cross-cultural Communication", "Global Business Protocol", "Traditions & Modernity", "Expat Adaptability", "Language Idioms & Nuance", "Cultural Stereotypes", "Festival Heritage", "Global Cuisine Trends", "Intercultural Marriage", "Subcultures & Youth"] },
      { id: 3, icon: "🗣️", title: "Debates & Expressing Opinions", subtopics: ["Articulating Arguments", "Polite Disagreement", "Evaluating Evidence", "Counterarguments", "Public Speaking", "Persuasive Pitching", "Moderating Discussions", "Logical Fallacies", "Consensus Building", "Defending Positions"] },
      { id: 4, icon: "🔬", title: "Science & Modern Technology", subtopics: ["Artificial Intelligence Impact", "Data Privacy & Security", "Medical Breakthroughs", "Space Exploration", "Automation in Industry", "Smartphone Addiction", "Biotechnology Progress", "Cybersecurity Risks", "Future of Transportation", "Renewable Energy Tech"] },
      { id: 5, icon: "📰", title: "Current Events & News Media", subtopics: ["Journalistic Ethics", "Fake News & Fact Checking", "Investigative Reporting", "Social Media Movements", "Global Trade News", "Crisis Management Coverage", "Public Health Policy", "Opinion Editorials", "Infographics & Data Journalism", "Media Censorship Debates"] },
      { id: 6, icon: "🎨", title: "Arts, Literature & Cinema", subtopics: ["Film Analysis", "Contemporary Literature", "Modern Art Exhibitions", "Theater & Performing Arts", "Architectural Styles", "Musical Genre Evolution", "Cultural Heritage Preservation", "Creative Writing", "Art Market & Auctions", "Literary Criticism"] },
      { id: 7, icon: "📊", title: "Global Economy & Business", subtopics: ["Inflation & Purchasing Power", "Stock Market Fluctuations", "E-commerce Boom", "Global Supply Chains", "Entrepreneurial Ecosystems", "Microfinance & Investing", "Corporate Social Responsibility", "Cryptocurrency Trends", "Consumer Psychology", "International Trade Agreements"] },
      { id: 8, icon: "⚖️", title: "Law, Rights & Society", subtopics: ["Human Rights Frameworks", "Intellectual Property Rights", "Civil Liberty Debates", "Consumer Protection Laws", "Labor Rights & Trade Unions", "Environmental Legislation", "Digital Rights & Copyright", "Community Policing", "Legal Arbitration", "Whistleblower Protections"] },
      { id: 9, icon: "🌍", title: "Sustainability & Climate Change", subtopics: ["Carbon Footprint Reduction", "Circular Economy", "Biodiversity Loss", "Renewable Energy Transition", "Urban Green Infrastructure", "Sustainable Agriculture", "Ocean Plastic Pollution", "Environmental Policy", "Corporate Eco-audit", "Eco-tourism Initiatives"] },
      { id: 10, icon: "🧠", title: "Mental Health & Wellbeing", subtopics: ["Mindfulness Practices", "Burnout Prevention", "Work-Life Integration", "Psychological Resilience", "Therapy & Counseling Awareness", "Digital Detox", "Emotional Intelligence", "Sleep Hygiene Science", "Support Systems", "Stigma Reduction"] },
    ],
  },
  {
    level: "C1",
    courseId: "c1-translation-course",
    color: "#8B5CF6",
    units: [
      { id: 1, icon: "🏛️", title: "Politics & Governance", subtopics: ["Constitutional Law Principles", "Electoral Reform Debates", "Geopolitical Alliances", "Public Policy Formulations", "Diplomatic Protocol", "Legislative Procedures", "Civic Engagement & Advocacy", "Governmental Transparency", "Bureaucratic Efficiency", "Fiscal Policy Strategy"] },
      { id: 2, icon: "📚", title: "Academic Discourse & Research", subtopics: ["Peer Review Standards", "Qualitative Research Methodology", "Interdisciplinary Synthesis", "Quantitative Data Interpretation", "Academic Thesis Defenses", "Scholarly Publication", "Citation & Plagiarism Ethics", "Grant Proposal Writing", "Hypothesis Formulation", "Paradigm Shifts in Science"] },
      { id: 3, icon: "📈", title: "Global Financial Systems", subtopics: ["Central Bank Monetary Policy", "Macroeconomic Forecasting", "Sovereign Debt Crises", "Venture Capital Dynamics", "Financial Derivatives Risk", "Global Trade Deficits", "Regulatory Compliance", "Asset Allocation Strategies", "Capital Market Volatility", "Fintech Disruption"] },
      { id: 4, icon: "🤖", title: "Ethics, AI & Technology", subtopics: ["Algorithmic Bias Mitigation", "Autonomous Weapons Ethics", "Data Sovereignty Laws", "Transhumanism Philosophy", "AI Governance Frameworks", "Surveillance Capitalism", "Genetic Modification Debates", "Quantum Computing Implications", "Tech Monopoly Regulation", "Digital Identity Rights"] },
      { id: 5, icon: "🖋️", title: "Rhetoric & Persuasive Writing", subtopics: ["Oratorical Devices & Cadence", "Aristotelian Appeals", "Subtle Innuendo & Nuance", "Polemical Arguments", "Crisis Speechwriting", "Editorial Persuasion", "Keynote Address Crafting", "Diplomatic Equivocation", "Rhetorical Question Impact", "Evocative Metaphor Construction"] },
      { id: 6, icon: "🌐", title: "Globalization & Cultural Identity", subtopics: ["Cultural Homogenization vs Diversity", "Diaspora & Transnationalism", "Indigenous Knowledge Preservation", "Post-colonial Literary Discourse", "Language Revitalization Efforts", "Global Consumer Culture Impact", "Glocalization Strategies", "Migration Policy Analysis", "Cross-cultural Hybridity", "National Identity Debates"] },
      { id: 7, icon: "🎭", title: "Critical Art & Film Analysis", subtopics: ["Cinematic Mise-en-scène Analysis", "Avant-garde Movement Critique", "Aesthetics & Deconstruction", "Symbolism in Modern Theatre", "Art Criticism & Historiography", "Cultural Commodification", "Curatorial Philosophy", "Visual Culture Semiotics", "Narrative Structure Subversion", "Aesthetic Theory Debates"] },
      { id: 8, icon: "🧬", title: "Scientific Innovation & Bioethics", subtopics: ["CRISPR Gene Editing Ethics", "Stem Cell Research Policies", "Clinical Trial Integrity", "Organ Transplantation Protocols", "Epidemiological Modeling", "Synthetic Biology Safety", "Neurotechnology Ethics", "Pharmaceutical Patent Debates", "AI in Diagnostic Medicine", "Bio-conservation Genetics"] },
      { id: 9, icon: "⚖️", title: "Judicial Systems & Social Justice", subtopics: ["Jurisprudential Philosophies", "Restorative vs Retributive Justice", "Constitutional Rights Adjudication", "Systemic Inequality Analysis", "Penal System Reform", "International Criminal Law", "Pro Bono Advocacy", "Class Action Litigation", "Judicial Precedents Analysis", "Civil Disobedience Legitimacy"] },
      { id: 10, icon: "💡", title: "Philosophical Inquiry & Thought", subtopics: ["Epistemology & Theories of Knowledge", "Existentialism & Meaning", "Utilitarianism vs Deontology", "Philosophy of Mind & Consciousness", "Ethics of Pragmatism", "Structuralism & Post-structuralism", "Political Philosophy & Liberty", "Philosophy of Language", "Phenomenology & Perception", "Determinism vs Free Will"] },
    ],
  },
  {
    level: "C2",
    courseId: "c2-translation-course",
    color: "#EC4899",
    units: [
      { id: 1, icon: "⚡", title: "Nuanced Argumentation & Debate", subtopics: ["Socratic Irony in Discourse", "Subtle Refutation Techniques", "Dialectical Synthesis", "Deconstructing Fallacious Logic", "Incisive Counter-arguments", "Precision in Conceptual Distinction", "Elusive Premise Examination", "Handling Hostile Cross-examination", "Sophisticated Persuasion", "Pithy Aphorisms in Debate"] },
      { id: 2, icon: "🎭", title: "Irony, Subtlety & Wit", subtopics: ["Mastering Dry Humor & Understatement", "Satirical Commentary", "Double Entendres & Puns", "Subtle Sarcasm & Innuendo", "Playful Literary Allusions", "Witty Retorts & Badinage", "Sardonically Expressing Doubt", "Nuanced Irony in Essayistry", "Implicit Subtext Construction", "Humorous Hyperbole"] },
      { id: 3, icon: "🧩", title: "Complex Idioms & Expressions", subtopics: ["Obscure Literary Idioms", "Archaic Yet Vibrant Phrasing", "Nuanced Colloquial Colloquialisms", "Etymological Precision", "Idiomatic Subversion", "Metaphorical Eloquence", "Sophisticated Proverbial Phrases", "Register-shifting Idioms", "High-register Conversational Flair", "Rare Expressive Formulations"] },
      { id: 4, icon: "📖", title: "Literary Prose & Stylistic Register", subtopics: ["Evocative Descriptive Cadence", "Intricate Narrative Structure", "Stream-of-Consciousness Elegance", "Poetic Diction in Prose", "Stylistic Pacing & Tension", "Ornate Historical Register", "Minimalist Poignant Prose", "Rich Allegorical Writing", "Sensory Imagery Synthesis", "Literary Pastiche & Parody"] },
      { id: 5, icon: "📜", title: "Legal Precision & Jurisprudence", subtopics: ["Statutory Construction Nuance", "Contractual Ambiguity Resolution", "Constitutional Originalism Debate", "Treaty Language Hermeneutics", "Evidentiary Rule Nuances", "Tort Liability Determinants", "Appellate Brief Eloquence", "Jurisdictional Conflict Analysis", "Legal Fiction Concepts", "Strict Constructionism Critique"] },
      { id: 6, icon: "🧪", title: "Scientific Formality & Epistemology", subtopics: ["Rigorous Experimental Controls", "Probabilistic Inference Precision", "Falsifiability & Scientific Method", "Epistemic Uncertainty Quantifier", "Theoretical Physics Conceptualization", "Biochemical Pathway Discourse", "Methodological Rigor Defense", "Paradigm Validation Metrics", "Complex Data Synthesis", "Scientific Monograph Style"] },
      { id: 7, icon: "🕊️", title: "Diplomatic & Geopolitical Discourse", subtopics: ["Diplomatic Ambiguity & Communiqués", "Bilateral Accord Nuances", "Multi-lateral Treaty Negotiation", "Sanction Mechanism Formulation", "Disarmament Protocol Terms", "Strategic Reserve Statements", "Consular Immunity Disputes", "Arbitration Protocol Crafting", "Soft Power Rhetoric", "Geopolitical Conflict Mediation"] },
      { id: 8, icon: "🌌", title: "Abstract Reasoning & Metaphysics", subtopics: ["Ontological Categorization", "Temporal Flow Paradigms", "Transcendental Idealism Concepts", "Modal Logic Reasoning", "Metaphysical Realism Debates", "Consciousness Hard Problem", "Philosophy of Mathematics", "Infinite Regress Resolution", "Teleological Argument Breakdown", "Solipsism & External Reality"] },
      { id: 9, icon: "📰", title: "Editorial Voice & Cultural Commentary", subtopics: ["Incisive Periodical Criticism", "Cultural Zeitgeist Analysis", "Sociological Essayistic Voice", "Polemical Column Writing", "Subtle Political Satire", "Architectural & Urban Critique", "Philosophical Book Reviews", "Thought-Leader Op-Ed Style", "Elegiac Cultural Retrospectives", "Provocative Social Commentary"] },
      { id: 10, icon: "👑", title: "Stylistic Flexibility & Mastery", subtopics: ["Effortless Register Shifting", "Mastering Archaic vs Ultra-modern Styles", "High-velocity Persuasive Eloquence", "Philosophical Concise Aphorisms", "Rich Multi-layered Prose", "Seamless Translation Adaptation", "Rhetorical Magnificence", "Precision Under Constraint", "Nuanced Verbal Virtuosity", "Masterclass Linguistic Polish"] },
    ],
  },
];

// Sentences per level. B1/B2/C1 get the full 10×10×10 = 1000. C2 is capped at
// the authentic CEFR-SP supply (~199 unique), so we take whatever is available.
const TARGET = { B1: 1000, B2: 1000, C1: 1000, C2: 200 };

// ---------------------------------------------------------------------------
// Load + filter CEFR-SP
// ---------------------------------------------------------------------------
function loadSentences(dataDir) {
  const files = [];
  for (const sub of ["SCoRE", "Wiki-Auto"]) {
    const dir = path.join(dataDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".txt")) files.push(path.join(dir, f));
    }
  }
  if (files.length === 0) {
    throw new Error(`No CEFR-SP .txt files found under ${dataDir} (SCoRE/ + Wiki-Auto/)`);
  }
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(f, "utf-8").split("\n")) {
      const p = line.replace(/\r$/, "").split("\t");
      if (p.length < 3) continue;
      const sent = p[0].trim();
      const a = parseInt(p[1], 10);
      const b = parseInt(p[2], 10);
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      if (a < 1 || a > 6 || b < 1 || b > 6) continue;
      if (sent.length < 20 || sent.length > 200) continue;
      if (/\d/.test(sent)) continue; // drop sentences with numbers
      if (/[^\x00-\x7F]/.test(sent)) continue; // English only
      rows.push({ sent, a, b });
    }
  }
  return rows;
}

// Deterministic shuffle (mulberry32) so re-runs are reproducible.
function shuffled(arr, seed) {
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `needed` unique English sentences for a level from the global pool.
function pickForLevel(level, needed, allRows, used) {
  const li = LEVEL_INDEX[level];
  const eligible = (minLo) =>
    allRows.filter(
      (r) => !used.has(r.sent.toLowerCase()) && Math.min(r.a, r.b) >= minLo && Math.max(r.a, r.b) >= li,
    );

  let pool = eligible(li); // both annotators at least at level
  if (pool.length < needed) {
    pool = eligible(li - 1); // relax to one level below
  }
  pool = shuffled(pool, li * 1000 + needed);
  const chosen = pool.slice(0, needed);
  for (const r of chosen) used.add(r.sent.toLowerCase());
  return chosen.map((r) => r.sent);
}

// ---------------------------------------------------------------------------
// Translation (Google Translate gtx endpoint, newline-batched, no API key)
// ---------------------------------------------------------------------------
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Translate one sentence and concatenate ALL of its returned segments. gtx
// sometimes splits a single (long/complex) sentence into several segments, so
// we join them back to recover the full translation. Used both directly and as
// the per-sentence fallback when a batched request's segment count mismatches.
async function translateOne(english) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(english);
  const { stdout } = await execFileP(
    "curl",
    ["-fsS", "-m", "25", "-A", UA, url],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout);
  const inner = data[0];
  const zh = inner
    .filter((seg) => Array.isArray(seg) && typeof seg[0] === "string")
    .map((seg) => seg[0])
    .join("")
    .replace(/\s+/g, (m) => (m.includes("\n") ? "" : m)) // drop newline artifacts
    .trim();
  return zh;
}

// Translate a batch of sentences joined by newlines. gtx normally returns one
// segment per input line; if it instead splits a line into several (segment
// count > N), we fall back to translating each sentence individually, which is
// always a clean 1:N mapping. Real HTTP errors (curl -f fails on 4xx/5xx) are
// retried with a long backoff because a 429 flag window lasts ~30–60s.
async function translateBatch(englishSentences) {
  const q = englishSentences.join("\n");
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(q);
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const { stdout } = await execFileP(
        "curl",
        ["-fsS", "-m", "25", "-A", UA, url],
        { maxBuffer: 32 * 1024 * 1024 },
      );
      const data = JSON.parse(stdout);
      const inner = data[0];
      const zh = inner
        .filter((seg) => Array.isArray(seg) && typeof seg[0] === "string")
        .map((seg) => seg[0]);
      if (zh.length === englishSentences.length) {
        return zh.map((s) => s.replace(/\s+/g, (m) => (m.includes("\n") ? "" : m)).trim());
      }
      // Segment count mismatch → one or more lines were split. Fall back to
      // translating each sentence on its own (never retries on a 429).
      const out = new Array(englishSentences.length);
      for (let k = 0; k < englishSentences.length; k++) {
        out[k] = await translateOne(englishSentences[k]);
        await new Promise((r) => setTimeout(r, 1500)); // pace the fallback
      }
      return out;
    } catch (err) {
      const wait = 60000 + Math.floor(Math.random() * 10000);
      process.stdout.write(`  HTTP error (${String(err.message).slice(0, 60)}), backing off ${wait}ms (attempt ${attempt + 1})\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  // Last resort: translate each sentence individually.
  const out = new Array(englishSentences.length);
  for (let k = 0; k < englishSentences.length; k++) {
    try { out[k] = await translateOne(englishSentences[k]); } catch { out[k] = ""; }
  }
  return out;
}

async function translateAll(level, sentences, cache) {
  const BATCH = 10;
  const GAP = 3000; // 3s between batches — under the gtx threshold.
  let done = 0;
  let remaining = sentences.filter((s) => !cache[s]);
  process.stdout.write(`  ${level}: ${remaining.length} sentences to translate (cached ${sentences.length - remaining.length})\n`);
  // Initial cooldown so we never open with a burst straight after a flag window.
  await new Promise((r) => setTimeout(r, 15000));
  for (let i = 0; i < remaining.length; i += BATCH) {
    const slice = remaining.slice(i, i + BATCH);
    const zh = await translateBatch(slice);
    let ok = 0;
    for (let j = 0; j < slice.length; j++) {
      if (zh[j]) {
        cache[slice[j]] = zh[j];
        ok++;
      }
    }
    // Flush cache after every batch so progress survives interruption.
    fs.writeFileSync(TRANSLATE_CACHE_PATH, JSON.stringify(cache));
    done += slice.length;
    process.stdout.write(`  translated ${done}/${remaining.length} (batch ${ok}/${slice.length} ok)\r`);
    await new Promise((r) => setTimeout(r, GAP));
  }
  process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","of","to","in","on","at","by","for","with","as","is","are","was","were","be","been","being","this","that","these","those","it","its","he","she","they","we","you","i","me","him","her","them","us","my","your","our","their","his","from","into","about","over","under","before","after","between","out","up","down","so","not","no","yes","do","does","did","has","have","had","will","would","can","could","should","may","might","must","what","which","who","whom","whose","when","where","why","how","there","here","than","too","very","just","also","such","any","all","each","more","most","other","some","own","same","one","two","three","new","now","both","either","neither","only",
]);

function cleanEnglish(sent) {
  let s = sent.replace(/\s+/g, " ").trim();
  s = s.replace(/^\s*[-–—]\s*/, "");
  s = s.replace(/\s*[-–—]\s*$/, "");
  // CEFR-SP stores tokenized text, so punctuation arrives detached ("piglets .").
  // Re-attach it, otherwise every answer reads like a word salad.
  s = s.replace(/\s+([.,;:!?])/g, "$1");
  s = s.replace(/([(])\s+/g, "$1").replace(/\s+([)])/g, "$1");
  if (!/[.!?]$/.test(s)) s += ".";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

function extractSrsWords(answer) {
  const words = answer
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, "").replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const seen = new Set();
  const out = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** Escape a value for the quoted `key: "..."` markdown syntax.
 *
 *  Sanitising happens here (not only at translate time) because the cache may
 *  hold entries written by an earlier revision that did not strip newlines. A
 *  stray "\n" inside the quotes would break the exercise format, so every
 *  value is flattened to a single line before it reaches the file. */
function esc(v) {
  return String(v)
    .replace(/\s*[\r\n]+\s*/g, "") // never let a newline land inside the quotes
    .replace(/[ \t]+/g, " ")
    .trim()
    .replace(/\s+([，。！？；：、])/g, "$1") // no space before CJK punctuation
    .replace(/\s+([.,;:!?])/g, "$1") // nor before Latin punctuation
    .replace(/"/g, '\\"');
}

function buildUnitMarkdown(course, unit, lessonsExercises) {
  let md = `---
unitTitle: "Unit ${unit.id}: ${unit.title}"
description: "Unit ${unit.id}: ${unit.title} - ${course.level} Translation Practice (${lessonsExercises.length} Lessons x 10 Sentences)"
icon: "${unit.icon}"
color: "${course.color}"
targetLanguage: "en"
sourceLanguage: "zh"
level: "${course.level}"
courseId: "${course.courseId}"
questionType: "translation"
---

`;

  lessonsExercises.forEach((exercises, lIdx) => {
    const lessonNum = lIdx + 1;
    const subtopic = unit.subtopics[lIdx] ?? `Lesson ${lessonNum}`;
    md += `---
lessonTitle: "Lesson ${lessonNum}: ${subtopic}"
description: "Translate ${course.level} sentences about ${subtopic}"
icon: "${unit.icon}"
color: "${course.color}"
---

`;
    for (const ex of exercises) {
      const srs = ex.srsWords.map((w) => `"${w}"`).join(" ");
      md += `[translation]
text: "Translate this sentence into English"
sentence: "${esc(ex.sentence)}"
answer: "${esc(ex.answer)}"
acceptAlso: "${esc(ex.answer)}"
srsWords: ${srs}

`;
    }
  });

  return md.trim() + "\n";
}

function buildCourseMarkdown(course, unitCount, lessonCount, totalSentences) {
  // The sentence count is reported from what we actually produced, not from a
  // nominal 10-per-lesson figure: C2 is capped at the authentic CEFR-SP supply
  // (~199), so a hardcoded "1000" would misrepresent it.
  return `---
id: "${course.courseId}"
courseTitle: "${course.level} 翻译${totalSentences}句"
description: "${course.level} Translation Course — CEFR-SP authentic sentences (${unitCount} Units x ${lessonCount} Lessons = ${totalSentences} Sentences)"
targetLanguage: "en"
sourceLanguage: "zh"
level: "${course.level}"
visibility: "public"
---
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function loadJson(p, fallback) {
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { /* ignore */ }
  }
  return fallback;
}

async function main() {
  // 1) Deterministic sentence selection (cached for reproducibility).
  let selection = loadJson(SELECTION_PATH, null);
  if (!selection) {
    console.log(`Loading CEFR-SP from ${DATA_DIR} ...`);
    const rows = loadSentences(DATA_DIR);
    console.log(`  filtered sentences: ${rows.length}`);
    const used = new Set();
    // Scarce levels first so they claim sentences before broader bands.
    const order = ["C2", "C1", "B2", "B1"];
    selection = {};
    for (const level of order) {
      const need = TARGET[level];
      const picked = pickForLevel(level, need, rows, used);
      selection[level] = picked;
      console.log(`  ${level}: picked ${picked.length} (target ${need})`);
    }
    fs.writeFileSync(SELECTION_PATH, JSON.stringify(selection));
  } else {
    console.log("Loaded cached selection from", SELECTION_PATH);
  }

  // 2) Resume translation from cache.
  const cache = loadJson(TRANSLATE_CACHE_PATH, {});
  // Backfill any selected sentence missing from cache into a flat list, but
  // translate per-level so we can report progress.
  for (const level of ["C2", "C1", "B2", "B1"]) {
    const sentences = selection[level];
    if (!sentences) continue;
    const missing = sentences.filter((s) => !cache[s]);
    if (missing.length === 0) {
      console.log(`${level}: all ${sentences.length} already translated`);
      continue;
    }
    console.log(`Translating ${level} ...`);
    await translateAll(level, sentences, cache);
  }
  fs.writeFileSync(TRANSLATE_CACHE_PATH, JSON.stringify(cache));

  // 3) Verify completeness, then write files.
  let incomplete = false;
  for (const level of ["C2", "C1", "B2", "B1"]) {
    const sentences = selection[level];
    const missing = sentences.filter((s) => !cache[s]);
    if (missing.length > 0) {
      console.log(`! ${level}: ${missing.length}/${sentences.length} sentences still untranslated — run again to resume`);
      incomplete = true;
    }
  }
  if (incomplete) {
    console.log("\nPartial progress saved. Re-run to translate the rest, then files will be written.");
    return;
  }

  // 4) Write markdown.
  for (const course of COURSES) {
    const level = course.level;
    const enSentences = selection[level];
    const pairs = enSentences.map((en) => ({ en, zh: cache[en] || "" }));
    const totalLessons = level === "C2" ? 2 : 10;
    const units = course.units;

    const lessonsExercises = [];
    let idx = 0;
    for (const unit of units) {
      const unitLessons = [];
      for (let l = 0; l < totalLessons; l++) {
        const lesson = [];
        for (let k = 0; k < 10; k++) {
          if (idx >= pairs.length) break;
          const { en, zh } = pairs[idx++];
          lesson.push({ sentence: zh, answer: cleanEnglish(en), srsWords: extractSrsWords(en) });
        }
        if (lesson.length > 0) unitLessons.push(lesson);
      }
      if (unitLessons.length > 0) lessonsExercises.push({ unit, lessons: unitLessons });
    }

    const actualUnits = lessonsExercises.length;
    const actualLessons = lessonsExercises.reduce((n, u) => n + u.lessons.length, 0);

    fs.writeFileSync(
      path.join(OUT_DIR, `${level.toLowerCase()}-translation-course.md`),
      buildCourseMarkdown(course, actualUnits, totalLessons, pairs.length),
      "utf-8",
    );
    for (const { unit, lessons } of lessonsExercises) {
      fs.writeFileSync(
        path.join(OUT_DIR, `${level.toLowerCase()}-translation-unit-${unit.id}.md`),
        buildUnitMarkdown(course, unit, lessons),
        "utf-8",
      );
    }
    console.log(`✓ ${level}: wrote ${actualUnits} units, ${actualLessons} lessons, ${pairs.length} sentences`);
  }

  console.log("\nDone. Re-seed the database (or redeploy) to publish the new content.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
