# Event Intelligence Chat

A conversational layer over a small set of external events and one company profile. Answers are grounded in the supplied events, separate stated facts from analytical inference, and say so when the data cannot support an answer.

Work is planned in the [roadmap](https://github.com/omrilevi1994/assignment/issues/2) and decisions are recorded in the [decision log](https://github.com/omrilevi1994/assignment/issues/1).

## Run locally

Requirements: pnpm 10 and Docker. pnpm downloads the pinned Node 24 on first use.

```bash
pnpm install
cp .env.example .env.local   # fill in OPENROUTER_API_KEY
pnpm dev:up                  # starts Postgres in Docker, then the app on http://localhost:3000
pnpm dev:down                # stops the database
```

## Verify

```bash
pnpm verify      # lint + module boundaries + typecheck + tests (also runs on pre-push)
pnpm test:watch  # tests in watch mode
pnpm graph       # module dependency graph -> docs/architecture/deps.mmd
```

## Data

The two supplied workbooks are kept unchanged in `data/raw/`. `pnpm data:convert` turns them into the committed files the app reads, `data/events.json` (30 events) and `data/company.json` (the company profile), validating every row against the Zod schemas in `src/domain/`. The app never parses spreadsheets at runtime.

Two rules from the exercise data carry through the whole system: the company profile is context for analysis and never evidence that an event occurred, and the source URLs are placeholders that may not resolve.

Architecture, grounding, trade-offs and scaling notes are added as the implementation lands.
