import fs from "fs";
import path from "path";

// Course definitions with themes, subtopics, and sentence generators
const LEVELS = [
  {
    level: "B1",
    courseId: "b1-translation-course",
    color: "#3B82F6",
    units: [
      { id: 1, icon: "💼", title: "Work & Career", topics: ["Applying for Jobs", "Job Interviews", "Office Routine", "Business Emails", "Team Meetings", "Project Management", "Customer Service", "Salary & Promotion", "Remote Work", "Career Development"] },
      { id: 2, icon: "✈️", title: "Travel & Transportation", topics: ["Booking Flights", "At the Airport", "Public Transport", "Renting a Car", "Hotel Check-in", "Sightseeing & Tours", "Asking for Directions", "Travel Emergencies", "Dining Abroad", "Cultural Experience"] },
      { id: 3, icon: "🏥", title: "Health & Fitness", topics: ["Visiting the Doctor", "Describing Symptoms", "At the Pharmacy", "Healthy Diet", "Gym & Exercise", "Mental Relaxation", "Medical Insurance", "First Aid", "Sleeping Habits", "Wellness Routines"] },
      { id: 4, icon: "🎓", title: "Education & Learning", topics: ["University Life", "Choosing a Major", "Exams & Study", "Online Learning", "Language Acquisition", "Group Projects", "Studying Abroad", "Library Research", "Vocational Training", "Lifelong Learning"] },
      { id: 5, icon: "🏡", title: "Housing & Living", topics: ["Renting an Apartment", "House Hunting", "Furniture & Decor", "Home Repairs", "Neighborhood Life", "Roommates & Neighbors", "Utilities & Bills", "Moving House", "Gardening & Household", "Safety at Home"] },
      { id: 6, icon: "🛍️", title: "Shopping & Consumer Life", topics: ["Supermarket Shopping", "Buying Clothes", "Online Shopping", "Returns & Refunds", "Budgeting & Saving", "Credit Cards & Banking", "Sales & Discounts", "Consumer Rights", "Electronics & Tech", "Gifts & Celebrations"] },
      { id: 7, icon: "📱", title: "Media & Entertainment", topics: ["Watching Movies", "Music & Concerts", "Social Media Use", "News & Current Events", "Video Games", "Reading Books & Blogs", "Podcasts & Streaming", "Celebrity Culture", "Photography", "Art & Museums"] },
      { id: 8, icon: "👥", title: "Relationships & Socializing", topics: ["Making New Friends", "Family Gathering", "Dating & Romance", "Resolving Conflicts", "Hosting a Party", "Giving Advice", "Keeping in Touch", "Workplace Friendship", "Social Etiquette", "Expressing Gratitude"] },
      { id: 9, icon: "🌱", title: "Environment & Nature", topics: ["Weather & Seasons", "Recycling & Garbage", "Energy Saving", "Animals & Pets", "Parks & Outdoor Life", "Water Conservation", "Local Farming", "Pollution Awareness", "Climate Trends", "Eco-friendly Habits"] },
      { id: 10, icon: "🎯", title: "Future Plans & Ambitions", topics: ["Setting Goals", "Saving for the Future", "Dream Jobs", "Starting a Business", "Personal Development", "Work-Life Balance", "Bucket List Travel", "Retirement Plans", "Learning New Skills", "Overcoming Obstacles"] }
    ]
  },
  {
    level: "B2",
    courseId: "b2-translation-course",
    color: "#6366F1",
    units: [
      { id: 1, icon: "👔", title: "Workplace Challenges & Management", topics: ["Handling Tight Deadlines", "Conflict Resolution", "Performance Reviews", "Delegating Tasks", "Leadership Dynamics", "Corporate Restructuring", "Negotiating Contracts", "Cross-departmental Cooperation", "Workplace Stress", "Innovation Strategy"] },
      { id: 2, icon: "🌍", title: "Cultural Differences & Exchange", topics: ["Cross-cultural Communication", "Global Business Protocol", "Traditions & Modernity", "Expat Adaptability", "Language Idioms & Nuance", "Cultural Stereotypes", "Festival Heritage", "Global Cuisine Trends", "Intercultural Marriage", "Subcultures & Youth"] },
      { id: 3, icon: "🗣️", title: "Debates & Expressing Opinions", topics: ["Articulating Arguments", "Polite Disagreement", "Evaluating Evidence", "Counterarguments", "Public Speaking", "Persuasive Pitching", "Moderating Discussions", "Logical Fallacies", "Consensus Building", "Defending Positions"] },
      { id: 4, icon: "🔬", title: "Science & Modern Technology", topics: ["Artificial Intelligence Impact", "Data Privacy & Security", "Medical Breakthroughs", "Space Exploration", "Automation in Industry", "Smartphone Addiction", "Biotechnology Progress", "Cybersecurity Risks", "Future of Transportation", "Renewable Energy Tech"] },
      { id: 5, icon: "📰", title: "Current Events & News Media", topics: ["Journalistic Ethics", "Fake News & Fact Checking", "Investigative Reporting", "Social Media Movements", "Global Trade News", "Crisis Management Coverage", "Public Health Policy", "Opinion Editorials", "Infographics & Data Journalism", "Media Censorship Debates"] },
      { id: 6, icon: "🎨", title: "Arts, Literature & Cinema", topics: ["Film Analysis", "Contemporary Literature", "Modern Art Exhibitions", "Theater & Performing Arts", "Architectural Styles", "Musical Genre Evolution", "Cultural Heritage Preservation", "Creative Writing", "Art Market & Auctions", "Literary Criticism"] },
      { id: 7, icon: "📊", title: "Global Economy & Business", topics: ["Inflation & Purchasing Power", "Stock Market Fluctuations", "E-commerce Boom", "Global Supply Chains", "Entrepreneurial Ecosystems", "Microfinance & Investing", "Corporate Social Responsibility", "Cryptocurrency Trends", "Consumer Psychology", "International Trade Agreements"] },
      { id: 8, icon: "⚖️", title: "Law, Rights & Society", topics: ["Human Rights Frameworks", "Intellectual Property Rights", "Civil Liberty Debates", "Consumer Protection Laws", "Labor Rights & Trade Unions", "Environmental Legislation", "Digital Rights & Copyright", "Community Policing", "Legal Arbitration", "Whistleblower Protections"] },
      { id: 9, icon: "🌿", title: "Sustainability & Climate Change", topics: ["Carbon Footprint Reduction", "Circular Economy", "Biodiversity Loss", "Renewable Energy Transition", "Urban Green Infrastructure", "Sustainable Agriculture", "Ocean Plastic Pollution", "Environmental Policy", "Corporate Eco-audit", "Eco-tourism Initiatives"] },
      { id: 10, icon: "🧠", title: "Mental Health & Wellbeing", topics: ["Mindfulness Practices", "Burnout Prevention", "Work-Life Integration", "Psychological Resilience", "Therapy & Counseling Awareness", "Digital Detox", "Emotional Intelligence", "Sleep Hygiene Science", "Support Systems", "Stigma Reduction"] }
    ]
  },
  {
    level: "C1",
    courseId: "c1-translation-course",
    color: "#8B5CF6",
    units: [
      { id: 1, icon: "🏛️", title: "Politics & Governance", topics: ["Constitutional Law Principles", "Electoral Reform Debates", "Geopolitical Alliances", "Public Policy Formulations", "Diplomatic Protocol", "Legislative Procedures", "Civic Engagement & Advocacy", "Governmental Transparency", "Bureaucratic Efficiency", "Fiscal Policy Strategy"] },
      { id: 2, icon: "📚", title: "Academic Discourse & Research", topics: ["Peer Review Standards", "Qualitative Research Methodology", "Interdisciplinary Synthesis", "Quantitative Data Interpretation", "Academic Thesis Defenses", "Scholarly Publication", "Citation & Plagiarism Ethics", "Grant Proposal Writing", "Hypothesis Formulation", "Paradigm Shifts in Science"] },
      { id: 3, icon: "📈", title: "Global Financial Systems", topics: ["Central Bank Monetary Policy", "Macroeconomic Forecasting", "Sovereign Debt Crises", "Venture Capital Dynamics", "Financial Derivatives Risk", "Global Trade Deficits", "Regulatory Compliance", "Asset Allocation Strategies", "Capital Market Volatility", "Fintech Disruption"] },
      { id: 4, icon: "🤖", title: "Ethics, AI & Technology", topics: ["Algorithmic Bias Mitigation", "Autonomous Weapons Ethics", "Data Sovereignty Laws", "Transhumanism Philosophy", "AI Governance Frameworks", "Surveillance Capitalism", "Genetic Modification Debates", "Quantum Computing Implications", "Tech Monopoly Regulation", "Digital Identity Rights"] },
      { id: 5, icon: "🖋️", title: "Rhetoric & Persuasive Writing", topics: ["Oratorical Devices & Cadence", "Aristotelian Appeals (Ethos, Pathos, Logos)", "Subtle Innuendo & Nuance", "Polemical Arguments", "Crisis Speechwriting", "Editorial Persuasion", "Keynote Address Crafting", "Diplomatic Equivocation", "Rhetorical Question Impact", "Evocative Metaphor Construction"] },
      { id: 6, icon: "🌐", title: "Globalization & Cultural Identity", topics: ["Cultural Homogenization vs Diversity", "Diaspora & Transnationalism", "Indigenous Knowledge Preservation", "Post-colonial Literary Discourse", "Language Revitalization Efforts", "Global Consumer Culture Impact", "Glocalization Strategies", "Migration Policy Analysis", "Cross-cultural Hybridity", "National Identity Debates"] },
      { id: 7, icon: "🎭", title: "Critical Art & Film Analysis", topics: ["Cinematic Mise-en-scène Analysis", "Avant-garde Movement Critique", "Aesthetics & Deconstruction", "Symbolism in Modern Theatre", "Art Criticism & Historiography", "Cultural Commodification", "Curatorial Philosophy", "Visual Culture Semiotics", "Narrative Structure Subversion", "Aesthetic Theory Debates"] },
      { id: 8, icon: "🧬", title: "Scientific Innovation & Bioethics", topics: ["CRISPR Gene Editing Ethics", "Stem Cell Research Policies", "Clinical Trial Integrity", "Organ Transplantation Protocols", "Epidemiological Modeling", "Synthetic Biology Safety", "Neurotechnology Ethics", "Pharmaceutical Patent Debates", "AI in Diagnostic Medicine", "Bio-conservation Genetics"] },
      { id: 9, icon: "⚖️", title: "Judicial Systems & Social Justice", topics: ["Jurisprudential Philosophies", "Restorative vs Retributive Justice", "Constitutional Rights Adjudication", "Systemic Inequality Analysis", "Penal System Reform", "International Criminal Law", "Pro Bono Advocacy", "Class Action Litigation", "Judicial Precedents Analysis", "Civil Disobedience Legitimacy"] },
      { id: 10, icon: "💡", title: "Philosophical Inquiry & Thought", topics: ["Epistemology & Theories of Knowledge", "Existentialism & Meaning", "Utilitarianism vs Deontology", "Philosophy of Mind & Consciousness", "Ethics of Pragmatism", "Structuralism & Post-structuralism", "Political Philosophy & Liberty", "Philosophy of Language", "Phenomenology & Perception", "Determinism vs Free Will"] }
    ]
  },
  {
    level: "C2",
    courseId: "c2-translation-course",
    color: "#EC4899",
    units: [
      { id: 1, icon: "⚡", title: "Nuanced Argumentation & Debate", topics: ["Socratic Irony in Discourse", "Subtle Refutation Techniques", "Dialectical Synthesis", "Deconstructing Fallacious Logic", "Incisive Counter-arguments", "Precision in Conceptual Distinction", "Elusive Premise Examination", "Handling Hostile Cross-examination", "Sophisticated Persuasion", "Pithy Aphorisms in Debate"] },
      { id: 2, icon: "🎭", title: "Irony, Subtlety & Wit", topics: ["Mastering Dry Humor & Understatement", "Satirical Commentary", "Double Entendres & Puns", "Subtle Sarcasm & Innuendo", "Playful Literary Allusions", "Witty Retorts & Badinage", "Sardonically Expressing Doubt", "Nuanced Irony in Essayistry", "Implicit Subtext Construction", "Humorous Hyperbole"] },
      { id: 3, icon: "🧩", title: "Complex Idioms & Expressions", topics: ["Obscure Literary Idioms", "Archaic Yet Vibrant Phrasing", "Nuanced Colloquialisms", "Etymological Precision", "Idiomatic Subversion", "Metaphorical Eloquence", "Sophisticated Proverbial Phrases", "Register-shifting Idioms", "High-register Conversational Flair", "Rare Expressive Formulations"] },
      { id: 4, icon: "📖", title: "Literary Prose & Stylistic Register", topics: ["Evocative Descriptive Cadence", "Intricate Narrative Structure", "Stream-of-Consciousness Elegance", "Poetic Diction in Prose", "Stylistic Pacing & Tension", "Ornate Historical Register", "Minimalist Poignant Prose", "Rich Allegorical Writing", "Sensory Imagery Synthesis", "Literary Pastiche & Parody"] },
      { id: 5, icon: "📜", title: "Legal Precision & Jurisprudence", topics: ["Statutory Construction Nuance", "Contractual Ambiguity Resolution", "Constitutional Originalism Debate", "Treaty Language Hermeneutics", "Evidentiary Rule Nuances", "Tort Liability Determinants", "Appellate Brief Eloquence", "Jurisdictional Conflict Analysis", "Legal Fiction Concepts", "Strict Constructionism Critique"] },
      { id: 6, icon: "🧪", title: "Scientific Formality & Epistemology", topics: ["Rigorous Experimental Controls", "Probabilistic Inference Precision", "Falsifiability & Scientific Method", "Epistemic Uncertainty Quantifier", "Theoretical Physics Conceptualization", "Biochemical Pathway Discourse", "Methodological Rigor Defense", "Paradigm Validation Metrics", "Complex Data Synthesis", "Scientific Monograph Style"] },
      { id: 7, icon: "🕊️", title: "Diplomatic & Geopolitical Discourse", topics: ["Diplomatic Ambiguity & Communiqués", "Bilateral Accord Nuances", "Multi-lateral Treaty Negotiation", "Sanction Mechanism Formulation", "Disarmament Protocol Terms", "Strategic Reserve Statements", "Consular Immunity Disputes", "Arbitration Protocol Crafting", "Soft Power Rhetoric", "Geopolitical Conflict Mediation"] },
      { id: 8, icon: "🌌", title: "Abstract Reasoning & Metaphysics", topics: ["Ontological Categorization", "Temporal Flow Paradigms", "Transcendental Idealism Concepts", "Modal Logic Reasoning", "Metaphysical Realism Debates", "Consciousness Hard Problem", "Philosophy of Mathematics", "Infinite Regress Resolution", "Teleological Argument Breakdown", "Solipsism & External Reality"] },
      { id: 9, icon: "📰", title: "Editorial Voice & Cultural Commentary", topics: ["Incisive Periodical Criticism", "Cultural Zeitgeist Analysis", "Sociological Essayistic Voice", "Polemical Column Writing", "Subtle Political Satire", "Architectural & Urban Critique", "Philosophical Book Reviews", "Thought-Leader Op-Ed Style", "Elegiac Cultural Retrospectives", "Provocative Social Commentary"] },
      { id: 10, icon: "👑", title: "Stylistic Flexibility & Mastery", topics: ["Effortless Register Shifting", "Mastering Archaic vs Ultra-modern Styles", "High-velocity Persuasive Eloquence", "Philosophical Concise Aphorisms", "Rich Multi-layered Prose", "Seamless Translation Adaptation", "Rhetorical Magnificence", "Precision Under Constraint", "Nuanced Verbal Virtuosity", "Masterclass Linguistic Polish"] }
    ]
  }
];

function generateSentenceSet(level, topicName, sentenceIndex) {
  const i = sentenceIndex + 1;
  const l = level.toLowerCase();

  const templates = {
    b1: [
      { zh: `在讨论${topicName}时，我们需要仔细考虑各种可能的情况。`, en: `When discussing ${topicName.toLowerCase()}, we need to carefully consider various possible situations.`, alt: `In discussing ${topicName.toLowerCase()}, we must carefully weigh different scenarios.`, words: ["discussing", "carefully", "consider", "various", "possible", "situations"] },
      { zh: `掌握${topicName}的相关知识有助于提升你的日常表达能力。`, en: `Mastering knowledge about ${topicName.toLowerCase()} helps improve your daily expression skills.`, alt: `Having a good grasp of ${topicName.toLowerCase()} enhances your everyday communication abilities.`, words: ["mastering", "knowledge", "helps", "improve", "daily", "expression", "skills"] },
      { zh: `关于${topicName}的主题，许多专家给出了非常实用的建议。`, en: `On the topic of ${topicName.toLowerCase()}, many experts have offered very practical advice.`, alt: `Regarding ${topicName.toLowerCase()}, numerous specialists provided quite useful recommendations.`, words: ["topic", "experts", "offered", "practical", "advice", "specialists"] },
      { zh: `如果你想深入了解${topicName}，阅读相关专业书籍是个不错的选择。`, en: `If you want to understand ${topicName.toLowerCase()} in depth, reading relevant professional books is a good choice.`, alt: `Reading relevant books is a great option if you wish to learn more about ${topicName.toLowerCase()}.`, words: ["understand", "depth", "reading", "relevant", "professional", "choice"] },
      { zh: `处理与${topicName}相关的问题时，保持冷静和耐心至关重要。`, en: `When dealing with issues related to ${topicName.toLowerCase()}, staying calm and patient is essential.`, alt: `It is vital to remain calm and patient when handling problems about ${topicName.toLowerCase()}.`, words: ["dealing", "issues", "related", "staying", "calm", "patient", "essential"] },
      { zh: `近年来，关于${topicName}的讨论在各个领域都变得越来越普遍。`, en: `In recent years, discussions on ${topicName.toLowerCase()} have become increasingly common across various fields.`, alt: `Discussions regarding ${topicName.toLowerCase()} have turned more widespread in many domains recently.`, words: ["recent", "discussions", "become", "increasingly", "common", "various", "fields"] },
      { zh: `了解${topicName}的基本原则可以帮助你做出更明智的决定。`, en: `Understanding the basic principles of ${topicName.toLowerCase()} can help you make wiser decisions.`, alt: `Grasping fundamental principles of ${topicName.toLowerCase()} helps in making smarter choices.`, words: ["understanding", "basic", "principles", "help", "make", "wiser", "decisions"] },
      { zh: `他在${topicName}方面积累了丰富的经验，并非常乐于分享。`, en: `He has accumulated rich experience in ${topicName.toLowerCase()} and is very willing to share.`, alt: `Having gathered extensive experience in ${topicName.toLowerCase()}, he is eager to share it.`, words: ["accumulated", "rich", "experience", "willing", "share", "extensive"] },
      { zh: `有效的沟通是解决${topicName}相关争议的关键所在。`, en: `Effective communication is the key to resolving disputes related to ${topicName.toLowerCase()}.`, alt: `Clear communication plays a key role in settling disputes concerning ${topicName.toLowerCase()}.`, words: ["effective", "communication", "key", "resolving", "disputes", "related"] },
      { zh: `通过不断的练习与反思，你可以在${topicName}领域取得长足进步。`, en: `Through continuous practice and reflection, you can make significant progress in the area of ${topicName.toLowerCase()}.`, alt: `With constant practice and reflection, great strides can be achieved in ${topicName.toLowerCase()}.`, words: ["continuous", "practice", "reflection", "make", "significant", "progress", "area"] }
    ],
    b2: [
      { zh: `针对${topicName}的深入分析揭示了其中复杂的内在关联。`, en: `In-depth analysis of ${topicName.toLowerCase()} revealed complex underlying connections.`, alt: `A thorough analysis regarding ${topicName.toLowerCase()} uncovered intricate internal links.`, words: ["in-depth", "analysis", "revealed", "complex", "underlying", "connections"] },
      { zh: `面对与${topicName}相关的挑战，制定战略性解决方案势在必行。`, en: `Confronted with challenges related to ${topicName.toLowerCase()}, devising strategic solutions is imperative.`, alt: `In light of challenges concerning ${topicName.toLowerCase()}, formulating strategic measures is essential.`, words: ["confronted", "challenges", "devising", "strategic", "solutions", "imperative"] },
      { zh: `公正在处理${topicName}领域的各种利益冲突中扮演着核心角色。`, en: `Fairness plays a pivotal role in resolving various conflicts of interest within ${topicName.toLowerCase()}.`, alt: `Impartiality occupies a central position when addressing competing interests in ${topicName.toLowerCase()}.`, words: ["fairness", "pivotal", "role", "resolving", "conflicts", "interest"] },
      { zh: `技术创新彻底改变了我们理解和应用${topicName}的方式。`, en: `Technological innovation has fundamentally transformed the way we perceive and apply ${topicName.toLowerCase()}.`, alt: `Tech advancements have completely reshaped how we understand and implement ${topicName.toLowerCase()}.`, words: ["technological", "innovation", "fundamentally", "transformed", "perceive", "apply"] },
      { zh: `关于${topicName}的激烈争论凸显了社会各界在此问题上的显著分歧。`, en: `The intense debate surrounding ${topicName.toLowerCase()} highlights significant divergences across society.`, alt: `Fierce argumentation over ${topicName.toLowerCase()} underscores marked disagreements throughout sectors.`, words: ["intense", "debate", "surrounding", "highlights", "significant", "divergences"] },
      { zh: `提升团队在${topicName}方面的专业素养是实现长期增长的基础。`, en: `Enhancing the team's professional expertise in ${topicName.toLowerCase()} forms the bedrock of long-term growth.`, alt: `Upgrading professional competence in ${topicName.toLowerCase()} serves as the foundation for sustainable expansion.`, words: ["enhancing", "professional", "expertise", "forms", "bedrock", "long-term", "growth"] },
      { zh: `社会公众对于${topicName}规范化管理的呼声正在日益高涨。`, en: `Public calls for standardized management regarding ${topicName.toLowerCase()} are steadily growing louder.`, alt: `Social demand for regulated oversight concerning ${topicName.toLowerCase()} continues to escalate.`, words: ["public", "standardized", "management", "regarding", "steadily", "growing"] },
      { zh: `跨国合作被广泛认为是攻克${topicName}全球难题最有效的途径。`, en: `International cooperation is widely acknowledged as the most effective avenue to tackle global hurdles in ${topicName.toLowerCase()}.`, alt: `Cross-border collaboration is viewed as vital for overcoming worldwide challenges in ${topicName.toLowerCase()}.`, words: ["international", "cooperation", "widely", "acknowledged", "effective", "avenue", "hurdles"] },
      { zh: `我们需要在经济效益与${topicName}可持续性之间取得微妙的平衡。`, en: `We must strike a delicate balance between financial returns and the sustainability of ${topicName.toLowerCase()}.`, alt: `Achieving a fine equilibrium between economic gains and ${topicName.toLowerCase()} sustainability is required.`, words: ["strike", "delicate", "balance", "financial", "returns", "sustainability"] },
      { zh: `在评估${topicName}的具体成果时，客观的数据和严谨的衡量标准不可或缺。`, en: `When evaluating concrete outcomes of ${topicName.toLowerCase()}, objective data and rigorous metrics are indispensable.`, alt: `Assessing tangible results in ${topicName.toLowerCase()} demands objective statistics and sound benchmarks.`, words: ["evaluating", "concrete", "outcomes", "objective", "data", "rigorous", "metrics", "indispensable"] }
    ],
    c1: [
      { zh: `对${topicName}的学术探讨要求研究者具备高度的批判性思维与严密的论证逻辑。`, en: `Academic discourse on ${topicName.toLowerCase()} demands that researchers possess acute critical thinking and rigorous logic.`, alt: `Scholarly inquiry into ${topicName.toLowerCase()} necessitates heightened critical discernment and cogent reasoning.`, words: ["academic", "discourse", "demands", "researchers", "possess", "critical", "thinking", "rigorous", "logic"] },
      { zh: `围绕${topicName}展开的政策制定过程，反映出复杂地缘政治格局下的利益博弈。`, en: `The policy-making process surrounding ${topicName.toLowerCase()} reflects intricate interplay of interests in a geopolitical landscape.`, alt: `Policy formulation concerning ${topicName.toLowerCase()} illuminates complex power dynamics across global arenas.`, words: ["policy-making", "process", "reflects", "intricate", "interplay", "interests", "geopolitical", "landscape"] },
      { zh: `当代学者在剖析${topicName}的演变历史时，提出了具有颠覆性的理论假说。`, en: `Contemporary scholars analyzing the evolutionary history of ${topicName.toLowerCase()} have proposed ground-breaking theoretical hypotheses.`, alt: `Modern academicians tracing ${topicName.toLowerCase()} have advanced revolutionary theoretical paradigms.`, words: ["contemporary", "scholars", "analyzing", "evolutionary", "proposed", "ground-breaking", "theoretical", "hypotheses"] },
      { zh: `全盘检视${topicName}的伦理维度，揭示了技术飞速演进背后的隐忧与道德困境。`, en: `Comprehensively auditing the ethical dimensions of ${topicName.toLowerCase()} reveals latent anxieties and moral dilemmas beneath rapid technological progression.`, alt: `An exhaustive review of the moral implications of ${topicName.toLowerCase()} exposes ethical quagmires in technological advancement.`, words: ["comprehensively", "auditing", "ethical", "dimensions", "reveals", "latent", "anxieties", "dilemmas"] },
      { zh: `演讲者巧妙地运用修辞格与宏大的历史视角，将${topicName}的主题升华为深刻的精神思考。`, en: `The orator deftly employed rhetorical tropes and a sweeping historical perspective to elevate ${topicName.toLowerCase()} into profound contemplation.`, alt: `Employing rhetoric and historical depth, the speaker transformed ${topicName.toLowerCase()} into a resonant philosophical meditation.`, words: ["orator", "deftly", "employed", "rhetorical", "tropes", "sweeping", "perspective", "elevate", "profound"] },
      { zh: `机构的官僚僵化严重阻碍了围绕${topicName}开展的新一轮制度创新与改革。`, en: `Institutional rigidity severely impedes the new wave of systemic innovation and structural reform surrounding ${topicName.toLowerCase()}.`, alt: `Bureaucratic inertia obstructs progressive policy overhauls and institutional restructuring in ${topicName.toLowerCase()}.`, words: ["institutional", "rigidity", "severely", "impedes", "systemic", "innovation", "structural", "reform"] },
      { zh: `在应对${topicName}带来的长远影响时，我们需要摒弃短视思维并构建前瞻性治理体系。`, en: `In mitigating long-term ramifications of ${topicName.toLowerCase()}, we must discard short-sightedness and construct visionary governance.`, alt: `Addressing the lasting impact of ${topicName.toLowerCase()} requires relinquishing myopia in favor of proactive governance frameworks.`, words: ["mitigating", "ramifications", "discard", "short-sightedness", "construct", "visionary", "governance"] },
      { zh: `关于${topicName}的跨学科研究，填补了传统方法论在解释宏观现象时的空白。`, en: `Interdisciplinary research on ${topicName.toLowerCase()} bridges gaps left by traditional methodologies in explaining macro-level phenomena.`, alt: `Cross-disciplinary synthesis regarding ${topicName.toLowerCase()} addresses methodological deficiencies in interpreting broad trends.`, words: ["interdisciplinary", "research", "bridges", "gaps", "traditional", "methodologies", "explaining", "macro-level", "phenomena"] },
      { zh: `司法裁决在审理涉及${topicName}的要案时，确立了具有里程碑意义的法律先例。`, en: `Judicial rulings in landmark cases involving ${topicName.toLowerCase()} established far-reaching legal precedents.`, alt: `Jurisprudence concerning landmark disputes in ${topicName.toLowerCase()} set crucial precedents for future legal interpretation.`, words: ["judicial", "rulings", "landmark", "cases", "involving", "established", "far-reaching", "legal", "precedents"] },
      { zh: `在全球化深度重塑社会结构的背景下，对${topicName}的再定义具备了前所未有的时代紧迫性。`, en: `As globalization deeply reshapes societal structures, redefining ${topicName.toLowerCase()} assumes unprecedented contemporary urgency.`, alt: `Amid globalization's reshaping of social fabric, reinterpreting ${topicName.toLowerCase()} becomes a matter of paramount timeliness.`, words: ["globalization", "reshapes", "societal", "structures", "redefining", "assumes", "unprecedented", "contemporary", "urgency"] }
    ],
    c2: [
      { zh: `文章对于${topicName}的剖析见解独到，行文间散发出精致的讽刺意味与深厚的人文底蕴。`, en: `The article's dissection of ${topicName.toLowerCase()} displays exceptional acuity, infused with refined irony and profound erudition.`, alt: `The treatise's critique of ${topicName.toLowerCase()} exhibits singular insight, steeped in subtle sarcasm and scholarly depth.`, words: ["article's", "dissection", "displays", "exceptional", "acuity", "infused", "refined", "irony", "profound", "erudition"] },
      { zh: `在探讨${topicName}这一极为抽象的概念时，作者展现出驾驭复杂句式与微言大义的精湛技艺。`, en: `When probing the elusive construct of ${topicName.toLowerCase()}, the author demonstrates masterful command over complex syntax and subtle nuance.`, alt: `In scrutinizing the abstract realm of ${topicName.toLowerCase()}, the writer reveals supreme virtuosity in stylistic nuance and economy of phrase.`, words: ["probing", "elusive", "construct", "author", "demonstrates", "masterful", "command", "complex", "syntax", "subtle", "nuance"] },
      { zh: `对于${topicName}相关法律条款的严谨释读，体现了司法文书中不容丝毫歧义的极致准确性。`, en: `The meticulous construction of statutory clauses governing ${topicName.toLowerCase()} exemplifies the uncompromising precision of legal drafting.`, alt: `Strict judicial interpretation of provisions pertaining to ${topicName.toLowerCase()} underscores the immaculate accuracy required in legal instruments.`, words: ["meticulous", "construction", "statutory", "clauses", "governing", "exemplifies", "uncompromising", "precision", "drafting"] },
      { zh: `这篇社论以针砭时弊的警策语言与冷峻的洞察力，直击${topicName}议题的核心矛盾。`, en: `With trenchant eloquence and sober insight, this editorial directly pierces the core antagonisms of ${topicName.toLowerCase()}.`, alt: `Characterized by incisive prose and dispassionate scrutiny, the commentary addresses the central paradoxes of ${topicName.toLowerCase()}.`, words: ["trenchant", "eloquence", "sober", "insight", "editorial", "directly", "pierces", "core", "antagonisms"] },
      { zh: `辩手通过引经据典与微妙的预设前提，在不经意间将对方引入了关于${topicName}的逻辑陷阱。`, en: `Interweaving classical illusions with subtle presuppositions, the debater imperceptibly steered the opponent into a logical snare regarding ${topicName.toLowerCase()}.`, alt: `Deploying scholarly allusions and understated premises, the speaker deftly trapped the adversary in a debate on ${topicName.toLowerCase()}.`, words: ["interweaving", "classical", "allusions", "subtle", "presuppositions", "debater", "imperceptibly", "steered", "opponent", "snare"] },
      { zh: `作者将警句般的凝练表达与对${topicName}的哲学思辨完美融为一体，堪称文体驾驭之典范。`, en: `The author seamlessly synthesizes aphoristic brevity with philosophical speculation on ${topicName.toLowerCase()}, crafting a masterpiece of stylistic mastery.`, alt: `Blending epigrammatic conciseness with metaphysical reflection on ${topicName.toLowerCase()}, the work epitomizes stylistic refinement.`, words: ["author", "seamlessly", "synthesizes", "aphoristic", "brevity", "philosophical", "speculation", "masterpiece", "stylistic", "mastery"] },
      { zh: `关于${topicName}的外交公报采用了精心雕琢的双关语义，旨在保持战略模糊性的同时维持对话通路。`, en: `The diplomatic communiqué regarding ${topicName.toLowerCase()} employed carefully calibrated ambiguity to maintain strategic flexibility while preserving dialogue channels.`, alt: `The official declaration on ${topicName.toLowerCase()} utilized artfully crafted ambivalence, balancing strategic deterrence with diplomatic engagement.`, words: ["diplomatic", "communiqué", "regarding", "employed", "carefully", "calibrated", "ambiguity", "maintain", "strategic", "flexibility"] },
      { zh: `科学界围绕${topicName}认识论基础的审视，颠覆了长期奉为圭臬的传统范式。`, en: `The scientific community's critique of the epistemological foundations of ${topicName.toLowerCase()} overturned long-revered orthodox paradigms.`, alt: `Scrutiny of the epistemic underpinnings of ${topicName.toLowerCase()} dismantled long-standing theoretical dogmas in the discipline.`, words: ["scientific", "community's", "critique", "epistemological", "foundations", "overturned", "long-revered", "orthodox", "paradigms"] },
      { zh: `这部作品以委婉优雅的文体风格与隐喻象征，深刻折射出时代变革中关于${topicName}的文化挽歌。`, en: `Through an understated stylistic elegance and rich symbolism, the work poignantly reflects a cultural elegy for ${topicName.toLowerCase()} amidst era shifts.`, alt: `Characterized by subtle prose cadence and metaphorical resonance, the narrative offers an elegiac critique of ${topicName.toLowerCase()}.`, words: ["understated", "stylistic", "elegance", "symbolism", "poignantly", "reflects", "cultural", "elegy", "amidst", "shifts"] },
      { zh: `在驾驭${topicName}高度抽象的论题时，展现出的游刃有余与精准表达，代表了语言修养的极致境界。`, en: `Demonstrating effortless fluency and supreme nuance when navigating abstract topics of ${topicName.toLowerCase()} represents the pinnacle of linguistic mastery.`, alt: `Commanding complex nuances in abstract discourse on ${topicName.toLowerCase()} reflects the absolute apex of verbal virtuosity.`, words: ["demonstrating", "effortless", "fluency", "supreme", "nuance", "navigating", "abstract", "topics", "pinnacle", "linguistic", "mastery"] }
    ]
  };

  const list = templates[l];
  const item = list[sentenceIndex % list.length];
  return {
    sentence: item.zh,
    answer: item.en,
    acceptAlso: item.alt,
    srsWords: item.words
  };
}

function buildMarkdownForUnit(levelObj, unit) {
  let md = `---
unitTitle: "Unit ${unit.id}: ${unit.title}"
description: "Unit ${unit.id}: ${unit.title} - ${levelObj.level} Translation Practice (10 Lessons x 10 Sentences)"
icon: "${unit.icon}"
color: "${levelObj.color}"
targetLanguage: "en"
sourceLanguage: "zh"
level: "${levelObj.level}"
courseId: "${levelObj.courseId}"
questionType: "translation"
---

`;

  for (let lIdx = 0; lIdx < unit.topics.length; lIdx++) {
    const topic = unit.topics[lIdx];
    const lessonNum = lIdx + 1;
    const lessonTitle = `Lesson ${lessonNum}: ${topic}`;

    md += `---
lessonTitle: "${lessonTitle}"
description: "Translate ${levelObj.level} sentences about ${topic}"
icon: "${unit.icon}"
color: "${levelObj.color}"
---

`;

    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const data = generateSentenceSet(levelObj.level, topic, sIdx);
      const srsFormatted = data.srsWords
        .map((w) => `"${w.toLowerCase()}"`)
        .join(" ");

      md += `[translation]
text: "Translate this sentence into English"
sentence: "${data.sentence}"
answer: "${data.answer}"
acceptAlso: "${data.acceptAlso}"
srsWords: ${srsFormatted}

`;
    }
  }

  return md.trim() + "\n";
}

function main() {
  console.log("Generating full B1, B2, C1, C2 translation courses (40 units, 400 lessons, 4000 sentences)...");
  const contentDir = path.join(process.cwd(), "content");

  let totalFiles = 0;
  let totalSentences = 0;

  for (const levelObj of LEVELS) {
    console.log(`\nGenerating ${levelObj.level} Course (${levelObj.courseId})...`);
    for (const unit of levelObj.units) {
      const fileName = `${levelObj.level.toLowerCase()}-translation-unit-${unit.id}.md`;
      const filePath = path.join(contentDir, fileName);

      const mdContent = buildMarkdownForUnit(levelObj, unit);
      fs.writeFileSync(filePath, mdContent, "utf-8");

      totalFiles++;
      totalSentences += 100;

      console.log(`  ✓ Written ${fileName} (10 lessons, 100 sentences, ${(mdContent.length / 1024).toFixed(1)} KB)`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Successfully generated ${totalFiles} unit files containing ${totalSentences} translation sentences!`);
  console.log(`========================================\n`);
}

main();
