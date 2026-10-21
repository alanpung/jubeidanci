(()=>{"use strict";module.exports=[576021,e=>{var t=e.i(68356),r=e.i(782927),a=e.i(847841),s=e.i(971724),i=e.i(105954),n=e.i(604147),o=e.i(206033),l=e.i(180473),c=e.i(665044),d=e.i(512e3),u=e.i(914674),g=e.i(875225),h=e.i(109292);e.i(751977);var p=e.i(128418),m=e.i(364754);e.i(876371);var f=e.i(61576),w=e.i(750621),y=e.i(679635);let v=/\bsrs_card\b/i,b=/\b(user|session|account|verification|user_stats|user_preferences|user_course_enrollment|lesson_completion|exercise_attempt|daily_activity|dictionary_word|word_cache|user_memory|course|unit|audio_cache|chat_conversation|article)\b/i;var x=e.i(809843);let T=`-- Table DDL
CREATE TABLE srs_card (
  word        TEXT NOT NULL,            -- always stored lowercase
  language    TEXT NOT NULL,            -- e.g. 'de', 'fr', 'es'
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  translation TEXT NOT NULL,
  cefr_level  TEXT,                     -- A1, A2, B1, B2, C1, C2
  pos         TEXT,                     -- part of speech
  gender      TEXT,                     -- grammatical gender (nullable)
  example_native  TEXT,
  example_english TEXT,
  status      TEXT NOT NULL DEFAULT 'new',   -- 'new' | 'learning' | 'review'
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval    INTEGER NOT NULL DEFAULT 0,    -- days until next review
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at  TIMESTAMP,
  last_reviewed_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (word, language, user_id)
);

Be careful if you use LIMIT parameter in your SQL queries as they don't give the full picture.
For example you should NOT use LIMIT for due cards.

-- SM-2 Algorithm Rules (apply these when updating a card after review)
-- Quality scale: 0=blackout, 1=wrong, 2=wrong but close, 3=correct with difficulty, 4=correct, 5=perfect
--
-- If quality >= 3 (correct):
--   if repetitions = 0: interval = 1
--   else if repetitions = 1: interval = 6
--   else: interval = round(interval * ease_factor)
--   repetitions = repetitions + 1
-- If quality < 3 (incorrect):
--   repetitions = 0, interval = 1
--
-- Always update ease_factor:
--   ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
--   ease_factor = greatest(1.3, ease_factor)
--
-- Status transitions:
--   'new' -> 'learning' (on first review)
--   'learning' -> 'review' (when repetitions >= 3)
--   'review' -> 'learning' (if quality < 3)
--
-- next_review_at = now() + (interval || ' days')::interval
--
-- A card is "due" when status IN ('learning','review') AND next_review_at <= now()
-- To introduce new cards: UPDATE status='learning', next_review_at=now() WHERE status='new'`;var E=e.i(164293),S=e.i(322498),k=e.i(262385);let R=`# Exercise Syntax Reference

## Unit Frontmatter

Every unit starts with YAML frontmatter containing ALL metadata. The frontmatter is the single source of truth:

\`\`\`
---
unitTitle: "Unit Title"
description: "Short English description of what this unit teaches"
icon: "📘"
color: "#4CAF50"
targetLanguage: "de"
sourceLanguage: "en"
level: "B1"
---
\`\`\`

| Field | Required | Description |
|-------|----------|-------------|
| unitTitle | yes | Unit title (in the target language) |
| description | yes | Short English description |
| icon | yes | Single emoji |
| color | yes | Hex color code |
| targetLanguage | yes | ISO 639-1 language code being learned (e.g. "de", "fr", "es") |
| sourceLanguage | yes | ISO 639-1 native language code (e.g. "en") |
| level | yes | CEFR level: A1, A2, B1, B2, C1, C2 |

## Lesson Sections

After the unit frontmatter, each lesson is defined by a \`---\` delimited metadata block:

\`\`\`
---
lessonTitle: "Greetings"
description: "Learn basic greeting phrases"
icon: "👋"
color: "#FF9600"
---

[exercise blocks here...]
\`\`\`

| Field | Required | Description |
|-------|----------|-------------|
| lessonTitle | yes | Lesson title |
| description | no | Short description of the lesson |
| icon | no | Single emoji |
| color | no | Hex color code |

## Exercise Blocks

Exercises are written in markdown files. Each exercise block starts with a type tag
\`[type-name]\` and fields are written as \`key: value\`. The parser splits on type tags
automatically — no \`---\` separators needed (though they're accepted and ignored).

## Comments

Lines starting with \`//\` (with optional leading whitespace) are stripped before parsing:

\`\`\`
// This is a comment — it will be ignored
[multiple-choice]
text: "What color is the sky?"
// Maybe add more choices later
choices:
  - "Blue" (correct)
  - "Green"
\`\`\`

## SRS Word Tracking

Every exercise **must** include an \`srsWords\` field listing the target-language word(s) to track in the spaced repetition system.
Words practiced correctly reinforce the card; incorrect answers flag them for review.

For most exercises this will be a single word. Use quotes for the value.

\`\`\`
srsWords: "gato"
\`\`\`

For multiple words, quote each one on the same line:

\`\`\`
srsWords: "gato" "perro"
\`\`\`

For \`matching-pairs\`, srsWords are auto-inferred from the left side of the pairs if omitted.

## Exercise Types

### multiple-choice

Present a text with several choices. Exactly one is marked \`(correct)\`.

| Field | Required | Description |
|-------|----------|-------------|
| text | yes | The question text |
| choices (list) | yes | \`- "text"\` items, one with \`(correct)\` |
| random_order | no | \`true\` to shuffle choices at runtime |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[multiple-choice]
text: "What does 'gato' mean?"
choices:
  - "Dog"
  - "Cat" (correct)
  - "Bird"
srsWords: "gato"
\`\`\`

### translation

User translates a sentence. Supports alternate accepted answers.

| Field | Required | Description |
|-------|----------|-------------|
| text | yes | Instruction shown to user |
| sentence | yes | The sentence to translate |
| answer | yes | The expected answer |
| acceptAlso | no | Additional accepted answers: \`"alt1" "alt2"\` |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[translation]
text: "Translate to English"
sentence: "El gato es negro"
answer: "The cat is black"
acceptAlso: "The cat's black"
srsWords: "gato" "negro"
\`\`\`

### fill-in-the-blank

User fills in the missing word in a sentence.

| Field | Required | Description |
|-------|----------|-------------|
| sentence | yes | Sentence with \`___\` marking the blank |
| blank | yes | The correct word for the blank |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[fill-in-the-blank]
sentence: "El ___ es negro"
blank: "gato"
srsWords: "gato"
\`\`\`

### matching-pairs

User matches left-side items to right-side items.

| Field | Required | Description |
|-------|----------|-------------|
| pairs (list) | yes | \`- "left" = "right"\` items |
| random_order | no | \`true\` to shuffle pairs |
| srsWords | no | Target-language word(s) for SRS (auto-inferred from pairs if omitted) |

\`\`\`
[matching-pairs]
- "gato" = "cat"
- "perro" = "dog"
- "p\xe1jaro" = "bird"
\`\`\`

### listening

User listens to TTS audio and types what they hear. Use \`mode: choices\` for multiple-choice UI or \`mode: word-bank\` for word reconstruction.

| Field | Required | Description |
|-------|----------|-------------|
| text | yes | The text that will be spoken |
| ttsLang | yes | BCP-47 language code for TTS (e.g. \`es-ES\`) |
| mode | no | \`choices\` or \`word-bank\` for alternate UI |
| choices (list) | when mode=choices | \`- "text"\` items, one with \`(correct)\` |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[listening]
text: "El gato es negro"
ttsLang: es-ES
srsWords: "gato" "negro"
\`\`\`

With \`mode: choices\`, provide a choices list (one marked \`(correct)\`):

\`\`\`
[listening]
text: "El gato es negro"
ttsLang: es-ES
mode: choices
choices:
  - "El gato es negro" (correct)
  - "El perro es negro"
  - "El gato es blanco"
srsWords: "gato" "negro"
\`\`\`

### word-bank

User assembles a sentence from a set of word tiles.

| Field | Required | Description |
|-------|----------|-------------|
| text | yes | Instruction shown to user |
| words | yes | Available tiles: \`"word1" "word2" ...\` |
| answer | yes | Correct order: \`"word1" "word2" ...\` |
| random_order | no | \`true\` to shuffle tiles |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[word-bank]
text: "Arrange the translation"
words: "cat" "the" "is" "black" "big"
answer: "the" "cat" "is" "black"
srsWords: "gato" "negro"
\`\`\`

### free-text

User writes a free-form text response. After submitting, an AI prompt is called with their response and the result (Markdown-formatted) is shown back. This exercise is always marked correct (participation-based).

| Field | Required | Description |
|-------|----------|-------------|
| text | yes | Instruction shown to user |
| afterSubmitPrompt | yes | AI prompt template — use \`{userResponse}\` as placeholder |
| srsWords | no | Target-language word(s) for SRS (optional for free-text) |

\`\`\`
[free-text]
text: "Write a short paragraph introducing yourself in German"
afterSubmitPrompt: "The user is learning German. They wrote: {userResponse}. Please provide feedback on grammar and vocabulary. Be encouraging."
\`\`\`

### speaking

User speaks a sentence aloud for pronunciation practice.

| Field | Required | Description |
|-------|----------|-------------|
| sentence | yes | The sentence the user should say |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[speaking]
sentence: "El gato es negro"
srsWords: "gato" "negro"
\`\`\`

### flashcard-review

A flashcard exercise for spaced repetition review. The user sees the front of the card, taps to reveal the back, then rates their recall. Both \`front\` and \`back\` support markdown.

| Field | Required | Description |
|-------|----------|-------------|
| front | yes | Front of the card (markdown) |
| back | yes | Back of the card (markdown) |
| srsWords | **yes** | Target-language word(s) for SRS |

\`\`\`
[flashcard-review]
front: "Katze"
back: "cat"
srsWords: "Katze"
\`\`\``,L=e.i(222378).c;async function _(_){var A;let C=await (0,x.k)();if(!(0,r.isAdminEmail)(C.user.email))return new Response("AI Chat is currently restricted to the author.",{status:403});let{messages:U,language:q,model:D}=await _.json(),I=q||await (0,S.i)(C.user.id)||"en",M=(0,r.getModelsForUser)(C.user.email).some(e=>e.id===D)?D:L,P=p.R[I]||I,W=(A=C.user.id,{syncToGitHub:(0,a.ka)({description:"Sync and push the entire codebase to the user's configured GitHub repository. Uses the repository URL and token already configured in the user's Settings, so you don't need to ask for their token or repository URL if already configured.",inputSchema:s.z.object({commitMessage:i.z.string().optional().describe("Optional commit message describing what changes to push")}),execute:async({commitMessage:t})=>{try{let{syncToGitHub:r}=await e.A(531140);return await r(t)}catch(e){return{success:!1,message:`GitHub sync error: ${e.message}. You can configure your repository URL and Personal Access Token in Settings.`}}}}),getCurriculumWords:(0,a.ka)({description:"Directly query and retrieve official CEFR curriculum vocabulary (from the comprehensive A1, A2, B1, B2, C1, C2 word bank JSON files). Use this tool whenever creating questions, quizzes, flashcards, exercises, or units so you have rich authentic vocabulary, translations, parts of speech, and example sentences without needing the user to have SRS cards.",inputSchema:s.z.object({level:n.z.enum(["A1","A2","B1","B2","C1","C2"]).optional().describe("CEFR level to fetch words from (A1, A2, B1, B2, C1, C2). If omitted, can search across all levels."),query:i.z.string().optional().describe("Search term or topic keyword (matches word, English translation, definition, or example sentence)"),pos:n.z.enum(["noun","verb","adjective","adverb","preposition","conjunction","pronoun","determiner"]).optional().describe("Filter by part of speech"),limit:o.z.number().int().min(1).max(50).default(10).describe("Number of words to return (default 10, max 50)"),random:l.z.boolean().optional().default(!0).describe("Whether to randomly shuffle matching words to give varied practice questions")}),execute:async({level:e,query:t,pos:r,limit:a=10,random:s=!0})=>{try{let i="english"===I?"en":I||"en",n=[];(n=e?await (0,w.Y)(e):await (0,w.y)(i))&&0!==n.length||(n=await (0,w.y)(i));let o=n;if(e){let t=e.toUpperCase().trim();o=o.filter(e=>(e.cefr_level||"").toUpperCase().trim()===t)}if(r){let e=r.toLowerCase().trim();o=o.filter(t=>(t.pos||"").toLowerCase().includes(e))}if(t&&t.trim()){let e=t.toLowerCase().trim();o=o.filter(t=>t.word.toLowerCase().includes(e)||t.english_translation&&t.english_translation.toLowerCase().includes(e)||t.definition_zh&&t.definition_zh.toLowerCase().includes(e)||t.example_sentence_native&&t.example_sentence_native.toLowerCase().includes(e))}let l=o.length,c=[...o];if(s&&c.length>0)for(let e=c.length-1;e>0;e--){let t=Math.floor(Math.random()*(e+1));[c[e],c[t]]=[c[t],c[e]]}let d=c.slice(0,a).map(e=>({word:e.word,cefr_level:e.cefr_level,pos:e.pos,english_translation:e.english_translation,definition_zh:e.definition_zh,example_sentence_native:e.example_sentence_native,example_sentence_english:e.example_sentence_english,ipa:e.ipa}));return{success:!0,totalMatched:l,count:d.length,words:d}}catch(e){return console.error("getCurriculumWords failed:",e),{success:!1,error:e.message,words:[]}}}}),readMemory:(0,a.ka)({description:"Read everything stored in the user's memory. Returns free-text notes that accumulate over time.",inputSchema:s.z.object({}),execute:async()=>{let[e]=await d.r.select().from(u.userMemory).where((0,g.and)((0,g.eq)(u.userMemory.userId,A),(0,g.eq)(u.userMemory.key,"memory"))).limit(1);return e?{found:!0,value:e.value}:{found:!1,value:""}}}),addMemory:(0,a.ka)({description:"Append a line to the user's memory. The text is added after a line break at the end of existing memory.",inputSchema:s.z.object({text:i.z.string().describe("The text to append to memory")}),execute:async({text:e})=>{let[t]=await d.r.select().from(u.userMemory).where((0,g.and)((0,g.eq)(u.userMemory.userId,A),(0,g.eq)(u.userMemory.key,"memory"))).limit(1),r=t?t.value+"\n"+e:e;return await d.r.insert(u.userMemory).values({userId:A,key:"memory",value:r}).onConflictDoUpdate({target:[u.userMemory.userId,u.userMemory.key],set:{value:r,updatedAt:new Date}}),{success:!0}}}),rewriteAllMemory:(0,a.ka)({description:"Replace the user's entire memory with new content. Use when memory needs to be reorganized or cleaned up.",inputSchema:s.z.object({value:i.z.string().describe("The new content to replace all existing memory")}),execute:async({value:e})=>(await d.r.insert(u.userMemory).values({userId:A,key:"memory",value:e}).onConflictDoUpdate({target:[u.userMemory.userId,u.userMemory.key],set:{value:e,updatedAt:new Date}}),{success:!0})}),srs:(0,a.ka)({description:"Execute SQL on the srs_card table. $1 is always bound to the current user's ID. Returns rows for SELECT, or affected row count for mutations. Only the srs_card table is accessible.",inputSchema:s.z.object({sql:i.z.string().describe("SQL query — use $1 for user_id")}),execute:async({sql:e})=>{if(!v.test(e))return{error:"Query must reference the srs_card table."};if(b.test(e))return{error:"Access denied: only the srs_card table is accessible."};try{let t=await d.Q.unsafe(e,[A]);if(/^\s*select/i.test(e))return{rows:Array.from(t),count:t.length};return{affected:t.count??t.length}}catch(e){return{error:e.message}}}}),presentExercise:(0,a.ka)({description:"Present an interactive exercise to the user. Pass the exercise as a markdown block (starting with the [type] tag) using the exercise syntax from the system prompt. The tool parses and renders it as an interactive widget. Present ONE exercise at a time and wait for the user to complete it before presenting another.",inputSchema:s.z.object({markdown:i.z.string().describe('Exercise markdown block starting with [type-tag], e.g. \'[multiple-choice]\\ntext: "What does gato mean?"\\n- "Cat" (correct)\\n- "Dog"\'')}),execute:async({markdown:e})=>{try{let t=(0,h.M)(e);return{success:!0,exercise:t}}catch(e){return{success:!1,error:e.message}}}}),createUnit:(0,a.ka)({description:"Create a learning unit from exercise markdown. The markdown MUST include ALL metadata in YAML frontmatter: title, description, icon, color, targetLanguage, sourceLanguage, and level. Then ## Lesson sections with exercises. This tool parses, validates, and inserts into the DB.",inputSchema:s.z.object({markdown:i.z.string().describe("Complete unit markdown with YAML frontmatter (title, description, icon, color, targetLanguage, sourceLanguage, level) and ## Lesson sections containing exercises"),courseId:i.z.string().optional().describe("Optional course ID to assign this unit to. Overrides courseId from frontmatter if provided.")}),execute:async({markdown:e,courseId:t})=>{let r,[a]=await d.r.select({targetLanguage:u.userPreferences.targetLanguage}).from(u.userPreferences).where((0,g.eq)(u.userPreferences.userId,A)).limit(1),s=a?.targetLanguage??I??"de",i=e.replace(/^```(?:markdown|md)?\n/m,"").replace(/\n```\s*$/,"").trim(),n=crypto.randomUUID();try{r=(0,f.f)(i)}catch(e){return{success:!1,error:`Failed to parse markdown: ${e instanceof Error?e.message:String(e)}`}}let o=r.targetLanguage??s,l=t??r.courseId;await d.r.insert(u.unit).values({id:n,courseId:l,title:r.title,description:r.description,icon:r.icon,color:r.color,markdown:i,targetLanguage:o,sourceLanguage:r.sourceLanguage,level:r.level,createdBy:A}),await d.r.insert(u.userStats).values({userId:A}).onConflictDoNothing();let h=r.lessons.reduce((e,t)=>e+t.exercises.length,0);return(0,c.revalidatePath)("/library","page"),(0,c.revalidatePath)("/units","page"),{success:!0,courseId:l??void 0,unitId:n,title:r.title,description:r.description,icon:r.icon,color:r.color,level:r.level,lessonCount:r.lessons.length,exerciseCount:h,lessonTitles:r.lessons.map(e=>e.title),url:`/unit/${n}`}}}),addWordsToSrs:(0,a.ka)({description:"Bulk-add words from the dictionary to the user's SRS deck. Filters by language (required), and optionally by CEFR level and/or word frequency range. Only adds words marked as useful for flashcards that aren't already in the user's deck.",inputSchema:s.z.object({language:i.z.string().describe("Language code, e.g. 'de', 'fr', 'es'"),cefrLevel:n.z.enum(["A1","A2","B1","B2","C1","C2"]).optional().describe("Filter by CEFR level (exact match)"),minFrequency:o.z.number().int().optional().describe("Minimum word frequency (inclusive)"),maxFrequency:o.z.number().int().optional().describe("Maximum word frequency (inclusive)"),limit:o.z.number().int().min(1).max(5e3).default(500).describe("Max words to add (default 500, max 5000)")}),execute:async({language:e,cefrLevel:t,minFrequency:r,maxFrequency:a,limit:s})=>{let i=[(0,g.eq)(u.dictionaryWord.language,e),(0,g.eq)(u.dictionaryWord.usefulForFlashcard,!0)];t&&i.push((0,g.eq)(u.dictionaryWord.cefrLevel,t)),void 0!==r&&i.push((0,g.gte)(u.dictionaryWord.wordFrequency,r)),void 0!==a&&i.push((0,g.lte)(u.dictionaryWord.wordFrequency,a));let n=[];try{let e=await d.r.select({word:u.dictionaryWord.word,translation:u.dictionaryWord.englishTranslation,cefrLevel:u.dictionaryWord.cefrLevel,pos:u.dictionaryWord.pos,gender:u.dictionaryWord.gender,exampleNative:u.dictionaryWord.exampleSentenceNative,exampleEnglish:u.dictionaryWord.exampleSentenceEnglish}).from(u.dictionaryWord).where((0,g.and)(...i)).orderBy(u.dictionaryWord.wordFrequency).limit(s);e&&e.length>0&&(n=e)}catch{}if(0===n.length){let r="english"===e?"en":e||"en",a=[];if(0===(a=t?await (0,w.Y)(t):await (0,w.y)(r)).length&&(a=await (0,w.y)(r)),t){let e=t.toUpperCase().trim();a=a.filter(t=>(t.cefr_level||"").toUpperCase().trim()===e)}n=a.slice(0,s).map(e=>({word:e.word,translation:e.english_translation||e.definition_zh||e.word,cefrLevel:e.cefr_level||t||"A1",pos:e.pos||"noun",gender:e.gender||null,exampleNative:e.example_sentence_native||null,exampleEnglish:e.example_sentence_english||null}))}if(0===n.length)return{success:!0,added:0,message:"No matching words found in dictionary JSON files or database."};for(let t of n)await (0,y.upsertLocalCard)({word:t.word.toLowerCase(),language:e,userId:A,translation:t.translation,cefrLevel:t.cefrLevel,pos:t.pos,gender:t.gender,status:"new",nextReviewAt:null});try{for(let t=0;t<n.length;t+=500){let r=n.slice(t,t+500);await d.r.insert(u.srsCard).values(r.map(t=>({word:t.word.toLowerCase(),language:e,userId:A,translation:t.translation,cefrLevel:t.cefrLevel,pos:t.pos,gender:t.gender,exampleNative:t.exampleNative,exampleEnglish:t.exampleEnglish,status:"new",nextReviewAt:null}))).onConflictDoNothing()}}catch{}return{success:!0,totalMatched:n.length,message:`Matched ${n.length} words from curriculum dictionary and added to SRS deck.`}}}),switchLanguage:(0,a.ka)({description:"Switch the user's target language and/or native language. At least one must be provided.",inputSchema:s.z.object({target_language:i.z.string().optional().describe("Target language code (e.g. 'fr', 'es', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'ko', 'zh', 'ja')"),native_language:i.z.string().optional().describe("Native language code (e.g. 'en', 'fr', 'es', 'de')")}),execute:async({target_language:e,native_language:t})=>{if(!e&&!t)return{success:!1,error:"Provide at least one of target_language or native_language."};let r=Object.keys(m.A).map(e=>`${e} (${p.R[e]||e})`).join(", ");if(e&&!m.A[e])return{success:!1,error:`Unsupported target language "${e}". Supported: ${r}`};if(t&&!m.A[t])return{success:!1,error:`Unsupported native language "${t}". Supported: ${r}`};let a=[];return e&&(await d.r.insert(u.userPreferences).values({userId:A,targetLanguage:e}).onConflictDoUpdate({target:u.userPreferences.userId,set:{targetLanguage:e,updatedAt:new Date}}),a.push(`target language to ${p.R[e]||e}`)),t&&(await d.r.insert(u.userPreferences).values({userId:A,nativeLanguage:t,updatedAt:new Date}).onConflictDoUpdate({target:u.userPreferences.userId,set:{nativeLanguage:t,updatedAt:new Date}}),a.push(`native language to ${p.R[t]||t}`)),(0,c.revalidatePath)("/"),{success:!0,target_language:e??void 0,native_language:t??void 0,message:`Switched ${a.join(" and ")}.`}}}),webSearch:(0,a.ka)({description:"Search the web using Exa to find articles, news, or information. Useful for finding content to translate with readArticle, or for looking up current information. Returns titles, URLs, summaries, and highlights for each result.",inputSchema:s.z.object({query:i.z.string().describe("The search query. Be specific and descriptive for best results."),numResults:o.z.number().int().min(1).max(10).default(5).describe("Number of results to return (default 5, max 10)"),category:n.z.enum(["news","research paper","company","tweet","personal site"]).optional().describe("Optional category to focus the search (e.g. 'news' for recent articles)"),startPublishedDate:i.z.string().optional().describe("Only return results published after this date. ISO 8601 format, e.g. '2025-01-01T00:00:00.000Z'")}),execute:async({query:e,numResults:t,category:r,startPublishedDate:a})=>{let s=process.env.EXA_API_KEY;if(!s)return{success:!1,error:"Exa API key is not configured. Web search is not available."};try{let i={query:e,numResults:t,type:"auto",contents:{highlights:{maxCharacters:3e3},summary:{query:e}}};r&&(i.category=r),a&&(i.startPublishedDate=a);let n=await fetch("https://api.exa.ai/search",{method:"POST",headers:{"x-api-key":s,"Content-Type":"application/json"},body:JSON.stringify(i)});if(!n.ok){let e=await n.text();return{success:!1,error:`Exa API error (${n.status}): ${e}`}}let o=(await n.json()).results.map(e=>({title:e.title||"Untitled",url:e.url||"",publishedDate:e.publishedDate||null,author:e.author||null,summary:e.summary||null,highlights:e.highlights||[]}));return{success:!0,query:e,resultCount:o.length,results:o}}catch(e){return{success:!1,error:`Web search failed: ${e.message}`}}}}),readArticle:(0,a.ka)({description:"Read a web article and translate it to a target language at a CEFR level. Creates a saved article the user can read later. Returns immediately with article ID — translation happens in background.",inputSchema:s.z.object({url:i.z.string().url().describe("The URL of the article to translate"),cefrLevel:n.z.enum(["A1","A2","B1","B2","C1","C2"]).default("B1").describe("CEFR difficulty level for the translation"),targetLanguage:i.z.string().optional().describe("Language code to translate into (e.g. 'de', 'fr', 'es'). Defaults to the user's current target language.")}),execute:async({url:t,cefrLevel:r,targetLanguage:a})=>{let{processTranslation:s}=await e.A(532878),i=a||I||"de",n=p.R[i]||i,[o]=await d.r.select().from(u.article).where((0,g.and)((0,g.eq)(u.article.userId,A),(0,g.eq)(u.article.sourceUrl,t),(0,g.eq)(u.article.targetLanguage,n),(0,g.eq)(u.article.cefrLevel,r))).limit(1);if(o?.status==="completed")return{success:!0,articleId:o.id,status:"completed",title:o.title,url:`/read/${o.id}`,message:"This article was already translated!"};if(o&&("fetching"===o.status||"translating"===o.status))return{success:!0,articleId:o.id,status:o.status,url:`/read/${o.id}`,message:"This article is already being translated."};let l=crypto.randomUUID();return await d.r.insert(u.article).values({id:l,userId:A,sourceUrl:t,targetLanguage:n,cefrLevel:r,status:"fetching"}),s(l,t,n,r).catch(e=>{console.error(`[${l}] Background processing error:`,e)}),(0,c.revalidatePath)("/read","page"),{success:!0,articleId:l,status:"fetching",url:`/read/${l}`,message:`Started translating article to ${n} at ${r} level. The user can check progress at /read/${l}.`}}})}),[F,z,N]=await Promise.all([(0,E.h)(C.user.id,"chat-system"),d.r.select().from(u.userMemory).where((0,g.and)((0,g.eq)(u.userMemory.userId,C.user.id),(0,g.eq)(u.userMemory.key,"memory"))).limit(1).then(e=>e[0]),(0,k.D)(C.user.id)]),O=z?.value??"",$=N?p.R[N]||N:"English",B=new Date,j=`${String(B.getDate()).padStart(2,"0")}-${B.toLocaleString("en-US",{month:"short"})}-${B.getFullYear()}`,G=(0,p.p)(F,{current_date:j,target_language:P,target_language_code:I,native_language:$,memory:O,exercise_syntax:R,srs_reference:T});return(0,t.W)({model:(0,r.getModel)(M),system:G,messages:await (0,t.C)(U),tools:W,stopWhen:(0,t.V)(7)}).toUIMessageStreamResponse()}e.s(["POST",0,_],576021)},861378,e=>{var t=e.i(747909),r=e.i(174017),a=e.i(996250),s=e.i(759756),i=e.i(561916),n=e.i(174677),o=e.i(869741),l=e.i(316795),c=e.i(487718),d=e.i(995169),u=e.i(47587),g=e.i(666012),h=e.i(570101),p=e.i(626937),m=e.i(10372),f=e.i(193695),w=e.i(509580);e.i(52474);var y=e.i(600220);let v=new t.AppRouteRouteModule({definition:{kind:r.f.APP_ROUTE,page:"/api/chat/route",pathname:"/api/chat",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/chat/route.ts",nextConfigOutput:"",userland:()=>e.r(576021),...{}}),{workAsyncStorage:b,workUnitAsyncStorage:x,serverHooks:T}=v;async function E(e,t,a){a.requestMeta&&(0,s.R)(e,a.requestMeta),v.isDev&&(0,s.i)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let b="/api/chat/route";b=b.replace(/\/index$/,"")||"/";let x=await v.prepare(e,t,{srcPage:b,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:T,deploymentId:E,params:S,nextConfig:k,parsedUrl:R,isDraftMode:L,prerenderManifest:_,routerServerContext:A,isOnDemandRevalidate:C,revalidateOnlyGenerated:U,resolvedPathname:q,clientReferenceManifest:D,serverActionsManifest:I,previewProps:M}=x,P=(0,o.f)(b),W=!!_.routes[q]&&(v.isDev||(0,w.f)(q,v.cacheOwner,_.routes[q])),F=!!(_.dynamicRoutes[P]||W),z=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,R,!1):t.end("This page could not be found"),null);if(F&&!L){let e=_.dynamicRoutes[P];if(e&&!1===e.fallback&&!W){if(k.adapterPath)return await z();throw new f.NoFallbackError}}let N=null;!F||v.isDev||L||(N="/index"===(N=q)?"/":N),I&&D&&(0,n.f)({page:b,clientReferenceManifest:D,serverActionsManifest:I});let O=e.method||"GET",$=(0,i.v)(),B=$.getActiveScopeSpan(),j=!!(null==A?void 0:A.isWrappedByNextServer),G=!!(0,s.w)(e,"minimalMode"),H=(0,s.w)(e,"incrementalCache")||await v.getIncrementalCache(e,k,M,_,G);null==H||H.resetRequestCache(),globalThis.__incrementalCache=H;let X={params:S,previewProps:M,renderOpts:{experimental:{authInterrupts:!!k.experimental.authInterrupts,useCacheTimeout:k.experimental.useCacheTimeout,durableUseCacheEntries:!!k.experimental.durableUseCacheEntries},cacheComponents:!!k.cacheComponents,validationLevel:k.experimental.instantInsights.validationLevel,isDraftMode:L,incrementalCache:H,hmrRefreshHash:(0,s.w)(e,"hmrRefreshHash"),cacheLifeProfiles:k.cacheLife,staticPageGenerationTimeout:k.staticPageGenerationTimeout,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0},sharedContext:{buildId:T,deploymentId:E}},Y=new l.x(e),Q=new l.e(t),K=c.k.fromNodeNextRequest(Y,(0,c.t)(t)),J=async({previousCacheEntry:r})=>{try{if(!G&&C&&U&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let s=null===N?await v.handle(K,X):await v.prerender(K,X);e.fetchMetrics=X.renderOpts.fetchMetrics;let i=X.renderOpts.pendingWaitUntil;i&&a.waitUntil&&(a.waitUntil(i),i=void 0);let n=X.renderOpts.collectedTags;if(!F)return await (0,g.f)(Y,Q,s,i),null;{let e=await s.blob(),t=(0,h.S)(s.headers);n&&(t[m.M]=n),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==X.renderOpts.collectedRevalidate&&!(X.renderOpts.collectedRevalidate>=m.Q)&&X.renderOpts.collectedRevalidate,a=void 0===X.renderOpts.collectedExpire||X.renderOpts.collectedExpire>=m.Q?!1!==r&&r>0?k.expireTime:void 0:X.renderOpts.collectedExpire;return{value:{kind:y.x.APP_ROUTE,status:s.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await v.onRequestError(e,t,{routerKind:"App Router",routePath:b,routeType:"route",revalidateReason:(0,u.f)({isStaticGeneration:null!==N,isOnDemandRevalidate:C})},!1,A),t}},V=async(s,n)=>{try{var o,l;let s=await v.handleResponse({req:e,nextConfig:k,cacheKey:N,routeKind:r.f.APP_ROUTE,isFallback:!1,previewProps:M,prerenderManifest:_,isRoutePPREnabled:!1,isOnDemandRevalidate:C,revalidateOnlyGenerated:U,responseGenerator:J,waitUntil:a.waitUntil,isMinimalMode:G});if(null!==s&&"error"in s)throw s.error;if(!F)return;if((null==s||null==(o=s.value)?void 0:o.kind)!==y.x.APP_ROUTE)throw Error(`Invariant: app-route received invalid cache entry ${null==s||null==(l=s.value)?void 0:l.kind}`);G||t.setHeader("x-nextjs-cache",C?"REVALIDATED":s.isMiss?"MISS":s.isStale?"STALE":"HIT"),L&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let i=(0,h.G)(s.value.headers);G&&F||i.delete(m.M),!s.cacheControl||t.getHeader("Cache-Control")||i.get("Cache-Control")||i.set("Cache-Control",(0,p.f)(s.cacheControl)),await (0,g.f)(Y,Q,new Response(s.value.body,{headers:i,status:s.value.status||200}));return}catch(r){if(r instanceof f.NoFallbackError||await v.onRequestError(e,r,{routerKind:"App Router",routePath:P,routeType:"route",revalidateReason:(0,u.f)({isStaticGeneration:null!==N,isOnDemandRevalidate:C})},!1,A),F)throw r;if(t.headersSent){if(s){let e=r instanceof Error?r:Error("Unknown app route error");s.recordException(e),s.setStatus({code:i.J.ERROR,message:e.message}),s.setAttribute("error.type",e.name)}t.writableEnded||t.destroyed||t.end()}else await (0,g.f)(Y,Q,new Response(null,{status:500}));return}finally{(()=>{if(!s)return;let e=t.statusCode;s.setAttributes({"http.status_code":e,"next.rsc":!1}),e&&e>=500&&(s.setStatus({code:i.J.ERROR}),s.setAttribute("error.type",e.toString()));let r=$.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.q.handleRequest)return console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route")||P,o=`${O} ${a}`;s.setAttributes({"next.route":a,"http.route":a,"next.span_name":o}),s.updateName(o),n&&n!==s&&(n.setAttribute("http.route",a),n.updateName(o))})()}};if(j&&B)await V(B,void 0);else{let t=$.getActiveScopeSpan();await $.withPropagatedContext(e.headers,()=>$.trace(d.q.handleRequest,{spanName:`${O} ${b}`,kind:i.C.SERVER,attributes:{"http.method":O,"http.target":e.url}},e=>V(e,t)),void 0,!j)}}e.s(["handler",0,E,"patchFetch",0,function(){return(0,a.f)({workAsyncStorage:b,workUnitAsyncStorage:x})},"routeModule",0,v,"serverHooks",0,T,"workAsyncStorage",0,b,"workUnitAsyncStorage",0,x])}]})();

//# sourceMappingURL=_10ewwxbz-dbbu._.js.map