# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run typecheck   # tsc --noEmit — type-check only, no files written
npm run build       # tsc — type-check + emit to dist/
npm run start       # node dist/index.js
npm run ci          # typecheck + build (exactly what GitHub Actions runs)
npm run fire-up     # ci → start
```

There is no test framework, linter, or formatter in this repo. `npm run ci` is the only gate — CI fails on type errors and nothing else.

Local run gotcha: in non-production, [src/index.ts](src/index.ts#L9-L23) loads `.env` from `path.join(__dirname, '.env')`, which resolves to `dist/.env` after compilation — not the repo-root `.env`. Copy or symlink the root `.env` into `dist/` before `npm start`, or pass `node --env-file=.env dist/index.js`. In production systemd service supplies the env file (`--env-file=/opt/momentkaph_be/.env`) and the in-app loader is skipped entirely.

## Architecture

A single Node HTTP server on `127.0.0.1:$PORT`, fronted by nginx which terminates TLS at `api.momentkaph.sk`. Two endpoints, both hand-routed by regex in [src/index.ts](src/index.ts#L47-L56):

- `GET /cloud_storage/:galleryType` → [src/handlers/cloudStorage.ts](src/handlers/cloudStorage.ts)
- `POST /email_sending` → [src/handlers/email.ts](src/handlers/email.ts)

### Zero runtime dependencies — this is load-bearing

`package.json` has **no `dependencies`**, only `typescript` and `@types/node`. Everything is built on node builtins:

| Concern | Implementation |
| --- | --- |
| AWS SigV4 request signing (DigitalOcean Spaces, S3-compatible) | [src/lib/aws.ts](src/lib/aws.ts#L58-L90), `crypto` + `https` |
| Resend email API client | [src/lib/resend.ts](src/lib/resend.ts), raw `https.request` |
| AVIF dimension extraction | [src/lib/imgSize.ts](src/lib/imgSize.ts), walks ISOBMFF boxes to `ispe` |
| `.env` parsing | inline in [src/index.ts](src/index.ts#L9-L23) |
| Body reading + size limits | `readBody` in [src/handlers/email.ts](src/handlers/email.ts#L72-L113) |

The deploy pipeline ships **only the contents of `dist/`** to the server (`tar -czf BE.tar.gz -C dist .`) — there is no `npm install` on the droplet and no `node_modules` there. **Adding a runtime dependency will break deployment** unless the packaging step in [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) is changed to bundle it.

### nginx and the app are two layers of the same defense

[nginx/](nginx/) is versioned here and deployed alongside the app. Several limits are deliberately enforced in both places, and the two must be kept in sync:

- **Gallery type allowlist** — `VALID_GALLERY_TYPES` in [src/handlers/cloudStorage.ts](src/handlers/cloudStorage.ts#L14-L17) must match the `location ~ ^/cloud_storage/(...)$` regex in [nginx/conf.d/apis.conf](nginx/conf.d/apis.conf). Adding a gallery means editing both.
- **Body size** — nginx `client_max_body_size 4k`; app caps at `MAX_BODY_BYTES = 8 * 1024` as a second line of defense.
- **CORS** — nginx adds the headers and answers `OPTIONS` in production. The app only sets CORS headers and handles `OPTIONS` when `NODE_ENV !== 'production'` ([src/index.ts](src/index.ts#L27-L41)), so local dev works without nginx. Don't add CORS handling that runs in production.
- **Method restriction, rate limiting, bad-bot blocking, response caching** (60d on gallery responses) all live in nginx only.

### Every failure returns a bare 404

Malformed JSON, wrong `Content-Type`, oversized payload, validation failure, honeypot hit, unknown route, Resend failure — all respond `404` with no body. Details go to `console.error` prefixed with the request ID (`x-request-id`, injected by nginx). This is intentional information hiding; preserve it when adding paths, and always log with the `[${requestId}]` prefix so lines can be correlated with nginx logs.

### Contact form flow

[src/lib/validate.ts](src/lib/validate.ts) returns a discriminated `ParseResult` (`ok` | `invalid`) rather than throwing. Each field has its own small parser that returns the normalized value and pushes errors into a shared array; `normalize()` trims, collapses whitespace, and caps raw length before validation. Spam heuristics: honeypot field `approval` must be empty, character-repetition ratio > 0.6 rejects, more than one link rejects.

On success the handler sends the notification mail to the site owner, responds `200`, then fires the submitter confirmation as **fire-and-forget** (`void sendApprovalEmail(...)`) so a slow Resend call can't hold the request open. Confirmation failures are logged only, never surfaced.

All template interpolation goes through `esc()` in [src/templates/email.ts](src/templates/email.ts#L68-L75) — HTML is assembled by string concatenation, so any new interpolated value must be escaped.

### Gallery flow

Objects are listed under the `{galleryType}/full/` prefix via a signed `ListObjectsV2` call, with keys scraped out of the XML by regex. For each object a ranged `GET` (first 10 KB) fetches just enough bytes to parse AVIF dimensions; mobile dimensions are derived as `width / 3`. Mobile URLs are constructed by convention as `{CDN}/{galleryType}/mobile/{fileName}` — they are never verified to exist. Dimension-parse failures are non-fatal: the image is returned without `width`/`height`.

## TypeScript configuration constraints

`tsconfig.json` is strict in ways that reject otherwise-normal TypeScript:

- **`module: NodeNext`** (ESM, `"type": "module"`) — relative imports **must** carry the `.js` extension even in `.ts` source: `import { sendEmail } from '../lib/resend.js'`.
- **`verbatimModuleSyntax`** — type-only imports must use `import type`.
- **`erasableSyntaxOnly`** — no `enum`, no constructor parameter properties, no namespaces. Use `const` objects and unions instead.
- Non-null assertions on `process.env.*` are the established pattern; there is no env-validation layer.

## Deployment

Push to `main` → [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) runs `npm ci && npm run ci`, packages `dist/` + `nginx/`, creates a GitHub Release tagged **`v{version from package.json}`**, then scp's the artifacts to the droplet and runs [scripts/deploy.sh](scripts/deploy.sh).

**Bump `version` in `package.json` for any change that will be merged to `main`** — the release step derives the tag from it and will collide on an existing tag otherwise.

[scripts/deploy.sh](scripts/deploy.sh) swaps `dist/` atomically (keeping `dist.prev` for rollback), and reinstalls the PM2 config and nginx config **only when their git tree hashes change**. Bad nginx config is caught by `nginx -t` and rolled back automatically. The `.env` file lives only on the server at `/opt/momentkaph_be/.env` and is never deployed.

Required env vars: `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `CORS_METHODS`, `CORS_HEADERS`, `CORS_MAX_AGE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_EMAIL_RECIPIENT`, `CLOUD_STORAGE_BUCKET_{ACCESS_KEY_ID,SECRET_KEY,REGION,PATH,HOST}`.

## Related

[notes.md](notes.md) (gitignored) tracks the owner's TODO backlog — infra hardening, bucket privacy, provider migration. It is a wishlist, not a description of current state; verify against the code before treating anything in it as implemented.
