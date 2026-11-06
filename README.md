# 句背单词 (jubeidanci)

AI-powered Chinese ↔ English sentence translation and vocabulary learning platform.

Practice through interactive translation exercises, spaced-repetition flashcards, and structured courses (A1–C2). Built for learners who want to master sentences, not just isolated words.

## Features

### Translation Courses

Pre-built courses at CEFR levels A1, A2, B1, B2, C1, C2:

- Over 1000 words per course
- Chinese → English translation with accepted variants and SRS word tagging
- Progressive difficulty and thematic units (work, travel, academic, etc.)

### Spaced Repetition (SRS)

SM-2 scheduling. Cards move through `New → Learning → Mastered`. New words can be added via adding course/unit to "My books", removing it will only reset the new word count, Learning/Mastered count will be remained

### Interactive Exercises

Multiple exercise types:

- Translation
- Flashcard
- Multiple choice
- Fill in the blank
- Word order
- Listening (TTS)
- Speaking (STT)

## Tech Stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Framework | Next.js 16, React 19                        |
| Language  | TypeScript                                  |
| Database  | PostgreSQL (Drizzle ORM)                    |
| Auth      | Better Auth                                 |
| AI        | Vercel AI SDK                               |
| TTS/STT   | OpenAI                                      |
| Storage   | Cloudflare R2                               |
| Styling   | Tailwind CSS 4                              |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com/) (for PostgreSQL)
- At least one AI provider API key

### 1. Clone and install

```bash
git clone https://github.com/alanpung/jubeidanci.git
cd jubeidanci
bun install
```

### 2. Configure environment

```bash
cp example.env.local .env.local
```

Edit `.env.local` with your API keys.

### 3. Start the database

```bash
bun run db:up        # starts PostgreSQL via Docker
bun run db:migrate   # run migrations
bun run db:seed      # load dictionaries and sample content
```

### 4. Run the app

```bash
bun run dev
```

## License

MIT
