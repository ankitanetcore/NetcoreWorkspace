# Contributing

Thanks for looking at NetcoreWorkspace. The supported app is the self-hosted web server.

## Setup

Node.js 22.13 or newer is required.

```bash
npm install
cp .env.example .env
npm run web
```

Open the `Open http://127.0.0.1:<port>` line printed at startup.

## Before a change

- Keep messages, files, and calls working for more than one browser.
- Do not commit `.env`, `server/data/`, or `server/data-*`.
- Do not add Causeway code. Document the port a Causeway user should publish.
- The project is MIT licensed. Do not change `LICENSE` in a contribution.
- Prefer a small fix over a new feature.

## Checks

```bash
npm run typecheck
npm test
```

`npm test` uses port 8123 and a temporary data directory. Typecheck uses `tsc --noEmit`. This repository does not yet have an ESLint configuration.

## Data

A change that would rewrite an existing `workspace.json` or require a migration needs to be called out in the pull request before it is merged.
