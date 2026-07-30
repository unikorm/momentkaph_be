# AGENTS.md

## Repository overview
- Backend service for `momentkaph.sk` written in TypeScript and compiled to Node.js ESM.
- Entry point: `/home/runner/work/momentkaph_be/momentkaph_be/src/index.ts`.
- Main features:
  - Gallery image listing + metadata from cloud storage (`/cloud_storage/:galleryType`)
  - Contact form email sending (`/email_sending`)

## Project structure
- `/home/runner/work/momentkaph_be/momentkaph_be/src/index.ts` — HTTP server, routing, CORS, env bootstrap.
- `/home/runner/work/momentkaph_be/momentkaph_be/src/handlers/` — request handlers.
- `/home/runner/work/momentkaph_be/momentkaph_be/src/lib/` — integrations and validation helpers.
- `/home/runner/work/momentkaph_be/momentkaph_be/src/templates/` — email template rendering.

## Build and run
From `/home/runner/work/momentkaph_be/momentkaph_be`:
- `npm run typecheck` — TypeScript check only.
- `npm run build` — compile TypeScript to `dist/`.
- `npm run ci` — typecheck + build.
- `npm run start` — run compiled server (`dist/index.js`).
- `npm run fire-up` — ci + start.

## Implementation notes
- Use ESM-style imports and keep `.js` file extensions in TypeScript imports.
- Keep request validation strict before external API calls.
- Keep logging request-scoped where possible (include request id).
- Keep changes minimal and localized; avoid broad refactors unless required.

## Validation expectations
- For code changes, run at least `npm run typecheck` and `npm run build`.
- If behavior changes, verify affected route logic in handlers and supporting libs.
