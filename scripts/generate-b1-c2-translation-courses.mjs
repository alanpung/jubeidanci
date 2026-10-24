import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
      { id: 10, icon: "🎯", title: "Future Plans & Ambitions", subtopics: ["Setting Goals", "Saving for the Future", "Dream Jobs", "Starting a Business", "Personal Development", "Work-Life Balance", "Bucket List Travel", "Retirement Plans", "Learning New Skills", "Overcoming Obstacles"] }
    ]
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
      { id: 10, icon: "🧠", title: "Mental Health & Wellbeing", subtopics: ["Mindfulness Practices", "Burnout Prevention", "Work-Life Integration", "Psychological Resilience", "Therapy & Counseling Awareness", "Digital Detox", "Emotional Intelligence", "Sleep Hygiene Science", "Support Systems", "Stigma Reduction"] }
    ]
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
      { id: 5, icon: "🖋️", title: "Rhetoric & Persuasive Writing", subtopics: ["Oratorical Devices & Cadence", "Aristotelian Appeals (Ethos, Pathos, Logos)", "Subtle Innuendo & Nuance", "Polemical Arguments", "Crisis Speechwriting", "Editorial Persuasion", "Keynote Address Crafting", "Diplomatic Equivocation", "Rhetorical Question Impact", "Evocative Metaphor Construction"] },
      { id: 6, icon: "🌐", title: "Globalization & Cultural Identity", subtopics: ["Cultural Homogenization vs Diversity", "Diaspora & Transnationalism", "Indigenous Knowledge Preservation", "Post-colonial Literary Discourse", "Language Revitalization Efforts", "Global Consumer Culture Impact", "Glocalization Strategies", "Migration Policy Analysis", "Cross-cultural Hybridity", "National Identity Debates"] },
      { id: 7, icon: "🎭", title: "Critical Art & Film Analysis", subtopics: ["Cinematic Mise-en-scène Analysis", "Avant-garde Movement Critique", "Aesthetics & Deconstruction", "Symbolism in Modern Theatre", "Art Criticism & Historiography", "Cultural Commodification", "Curatorial Philosophy", "Visual Culture Semiotics", "Narrative Structure Subversion", "Aesthetic Theory Debates"] },
      { id: 8, icon: "🧬", title: "Scientific Innovation & Bioethics", subtopics: ["CRISPR Gene Editing Ethics", "Stem Cell Research Policies", "Clinical Trial Integrity", "Organ Transplantation Protocols", "Epidemiological Modeling", "Synthetic Biology Safety", "Neurotechnology Ethics", "Pharmaceutical Patent Debates", "AI in Diagnostic Medicine", "Bio-conservation Genetics"] },
      { id: 9, icon: "⚖️", title: "Judicial Systems & Social Justice", subtopics: ["Jurisprudential Philosophies", "Restorative vs Retributive Justice", "Constitutional Rights Adjudication", "Systemic Inequality Analysis", "Penal System Reform", "International Criminal Law", "Pro Bono Advocacy", "Class Action Litigation", "Judicial Precedents Analysis", "Civil Disobedience Legitimacy"] },
      { id: 10, icon: "💡", title: "Philosophical Inquiry & Thought", subtopics: ["Epistemology & Theories of Knowledge", "Existentialism & Meaning", "Utilitarianism vs Deontology", "Philosophy of Mind & Consciousness", "Ethics of Pragmatism", "Structuralism & Post-structuralism", "Political Philosophy & Liberty", "Philosophy of Language", "Phenomenology & Perception", "Determinism vs Free Will"] }
    ]
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
      { id: 10, icon: "👑", title: "Stylistic Flexibility & Mastery", subtopics: ["Effortless Register Shifting", "Mastering Archaic vs Ultra-modern Styles", "High-velocity Persuasive Eloquence", "Philosophical Concise Aphorisms", "Rich Multi-layered Prose", "Seamless Translation Adaptation", "Rhetorical Magnificence", "Precision Under Constraint", "Nuanced Verbal Virtuosity", "Masterclass Linguistic Polish"] }
    ]
  }
];

async function generateLessonContent(level, unitTitle, lessonTitle, subtopic) {
  const prompt = `You are an expert curriculum author for English translation learning (${level} level).
Generate exactly 10 high-quality translation exercises for Chinese learners studying English at ${level} level.

Unit Title: "${unitTitle}"
Lesson Title: "${lessonTitle}" (${subtopic})

Target CEFR Level: ${level}

Guidelines:
1. "sentence": Chinese sentence (natural, contextually accurate for ${level} level).
2. "answer": Natural, precise English translation appropriate for ${level} CEFR level.
3. "acceptAlso": One valid alternative English translation.
4. "srsWords": Array of 3 to 8 key English target vocabulary words from the answer (lowercase, individual words, clean string tokens).

Format Requirement: Return ONLY a valid JSON array of exactly 10 objects:
[
  {
    "sentence": "中文句子",
    "answer": "English sentence.",
    "acceptAlso": "Alternative English sentence.",
    "srsWords": ["word1", "word2", "word3"]
  }
]`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sentence: { type: Type.STRING },
            answer: { type: Type.STRING },
            acceptAlso: { type: Type.STRING },
            srsWords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["sentence", "answer", "acceptAlso", "srsWords"]
        }
      }
    }
  });

  const rawJson = response.text.trim();
  return JSON.parse(rawJson);
}

function formatMarkdownUnit(course, unit, lessonsData) {
  let md = `---
unitTitle: "Unit ${unit.id}: ${unit.title}"
description: "Unit ${unit.id}: ${unit.title} - ${course.level} Translation Practice (10 Lessons x 10 Sentences)"
icon: "${unit.icon}"
color: "${course.color}"
targetLanguage: "en"
sourceLanguage: "zh"
level: "${course.level}"
courseId: "${course.courseId}"
questionType: "translation"
---

`;

  for (let lIdx = 0; lIdx < unit.subtopics.length; lIdx++) {
    const subtopic = unit.subtopics[lIdx];
    const lessonNum = lIdx + 1;
    const lessonTitle = `Lesson ${lessonNum}: ${subtopic}`;
    const exercises = lessonsData[lIdx];

    md += `---
lessonTitle: "${lessonTitle}"
description: "Translate ${course.level} sentences about ${subtopic}"
icon: "${unit.icon}"
color: "${course.color}"
---

`;

    for (const ex of exercises) {
      const srsStr = ex.srsWords
        .map((w) => `"${w.toLowerCase().replace(/[^a-z0-9'-]/g, "")}"`)
        .filter((w) => w.length > 2)
        .join(" ");

      md += `[translation]
text: "Translate this sentence into English"
sentence: "${ex.sentence.replace(/"/g, '\\"')}"
answer: "${ex.answer.replace(/"/g, '\\"')}"
acceptAlso: "${ex.acceptAlso.replace(/"/g, '\\"')}"
srsWords: ${srsStr}

`;
    }
  }

  return md.trim() + "\n";
}

async function main() {
  console.log("Starting generation of B1, B2, C1, C2 translation courses...");
  const contentDir = path.join(process.cwd(), "content");

  for (const course of COURSES) {
    console.log(`\n========================================`);
    console.log(`Processing Course: ${course.courseId} (${course.level})`);
    console.log(`========================================`);

    for (const unit of course.units) {
      const fileName = `${course.level.toLowerCase()}-translation-unit-${unit.id}.md`;
      const filePath = path.join(contentDir, fileName);

      console.log(`Generating Unit ${unit.id}/10: ${unit.title} (${fileName})...`);

      const lessonsData = [];

      for (let lIdx = 0; lIdx < unit.subtopics.length; lIdx++) {
        const subtopic = unit.subtopics[lIdx];
        const lessonNum = lIdx + 1;
        const lessonTitle = `Lesson ${lessonNum}: ${subtopic}`;

        console.log(`  -> Generating Lesson ${lessonNum}/10: ${subtopic}`);
        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
          try {
            attempts++;
            const exercises = await generateLessonContent(course.level, unit.title, lessonTitle, subtopic);
            if (Array.isArray(exercises) && exercises.length === 10) {
              lessonsData.push(exercises);
              success = true;
            } else {
              console.warn(`     Attempt ${attempts}: Invalid exercise count (${exercises?.length}), retrying...`);
            }
          } catch (err) {
            console.error(`     Attempt ${attempts} error:`, err.message || err);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        if (!success) {
          console.error(`FAILED to generate ${lessonTitle} after 3 attempts! Exiting.`);
          process.exit(1);
        }
      }

      const mdContent = formatMarkdownUnit(course, unit, lessonsData);
      fs.writeFileSync(filePath, mdContent, "utf-8");
      console.log(`✓ Saved ${fileName} (${(mdContent.length / 1024).toFixed(1)} KB)`);
    }
  }

  console.log("\nAll B1-C2 translation course units generated successfully!");
}

main().catch((err) => {
  console.error("Fatal error in generator script:", err);
  process.exit(1);
});
