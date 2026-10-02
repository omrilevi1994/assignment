# Event Intelligence Chat

A conversational layer over a small set of external events and one company profile. Answers are grounded in the supplied events, separate stated facts from analytical inference, and say so when the data cannot support an answer.

Work is planned in the [roadmap](https://github.com/omrilevi1994/assignment/issues/2) and decisions are recorded in the [decision log](https://github.com/omrilevi1994/assignment/issues/1).

## Run locally

Requirements: Node 22, pnpm 10, Docker.

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

Architecture, grounding, trade-offs and scaling notes are added as the implementation lands.
