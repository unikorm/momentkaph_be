# momentkaph_be

Backend API for [momentkaph.sk](https://momentkaph.sk), a photography portfolio site. It's a small, dependency-free Node.js/TypeScript service that does exactly two things:

- serves gallery images from a private DigitalOcean Spaces (S3-compatible) bucket via short-lived signed URLs
- receives the site's contact form and relays it as an email through [Resend](https://resend.com)

No web framework, no ORM, no third-party SDKs — just Node's built-in `http` and `https` modules and hand-rolled AWS SigV4 signing. It's built to run comfortably on a 512MB VM.

## How it works

### `GET /cloud_storage/:galleryType`

Lists the images in a gallery folder (`weddings`, `portrait`, `love-story`, `family`, `studio`, `pregnancy`, `baptism`, `newborn`) and returns their dimensions plus presigned URLs:

```json
[
  {
    "fullUrl": "https://.../weddings/full/photo.avif?X-Amz-...",
    "mobileUrl": "https://.../weddings/mobile/photo.avif?X-Amz-...",
    "width": 4000,
    "height": 2667,
    "mobileWidth": 1333,
    "mobileHeight": 889
  }
]
```

The bucket itself is private. Each request lists objects and signs a time-limited (30 min) SigV4 GET URL per image, for both the full-size and mobile variant, so the frontend never needs long-lived credentials. Image dimensions are read by pulling just the first ~10KB of each AVIF file and parsing its header — no image library needed.

### `POST /email_sending`

Accepts a JSON contact-form submission (`name`, `email`, `phone`, `message`, plus a hidden `approval` honeypot field), validates it, and forwards it as an HTML email via the Resend API. Validation covers field length, email/phone format, and basic spam heuristics (repeated characters, multiple links).

Both routes fail closed: any error, invalid input, or unmatched route returns a 404 rather than leaking details.

## Project layout

```
src/
  index.ts               plain http server, routing, CORS (dev only), .env loading
  handlers/
    cloudStorage.ts       gallery listing + presigned URL generation
    email.ts              contact form intake + Resend dispatch
  lib/
    aws.ts                hand-rolled SigV4 signing for DO Spaces (S3-compatible)
    imgSize.ts             AVIF header parsing for width/height
    resend.ts              minimal Resend API client
    validate.ts             contact form validation
  templates/
    email.ts               HTML email template
nginx/                    reverse proxy config shipped alongside the app
scripts/
  deploy.sh                zero-downtime deploy script run on the VM
  ecosystem.config.cjs      PM2 process config
```

## Running locally

Requires Node 24+.

```bash
npm install
npm run fire-up   # typecheck -> build -> start
```

Or individually:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc -> dist/
npm run start       # node dist/index.js
```

Create a `.env` file in the project root (loaded automatically outside production — see `src/index.ts`):

```
PORT=3000
NODE_ENV=development

CORS_ORIGIN=http://localhost:5173
CORS_METHODS=GET,POST,OPTIONS
CORS_HEADERS=Content-Type
CORS_MAX_AGE=86400

CLOUD_STORAGE_BUCKET_HOST=<bucket>.<region>.digitaloceanspaces.com
CLOUD_STORAGE_BUCKET_PATH=<unused/reserved>
CLOUD_STORAGE_BUCKET_REGION=<region>
CLOUD_STORAGE_BUCKET_ACCESS_KEY_ID=<spaces access key>
CLOUD_STORAGE_BUCKET_SECRET_KEY=<spaces secret key>

RESEND_API_KEY=<resend api key>
RESEND_FROM_EMAIL=<verified sender>
RESEND_EMAIL_RECIPIENT=<destination inbox>
```

In production, `NODE_ENV=production` disables `.env` loading (env vars are injected by PM2 instead, see `scripts/ecosystem.config.cjs`) and disables the CORS/OPTIONS handling in-app, since nginx owns that in front of it.

## Deployment

CI/CD is GitHub Actions (`.github/workflows/ci-cd.yml`), triggered on push to `main`:

1. **build** — `npm ci && npm run ci`, packages `dist/`, `nginx/`, and the PM2 config into release artifacts, tagged with the `package.json` version.
2. **release** — publishes those artifacts as a GitHub Release.
3. **deploy** — ships the artifacts over `scp` to the target droplet and runs `scripts/deploy.sh` over SSH.

`deploy.sh` performs an atomic, rollback-safe swap:
- the new `dist/` replaces the old one, keeping `dist.prev` around for rollback
- nginx config is only replaced/reloaded if its content hash changed, and `nginx -t` must pass before `systemctl reload nginx` is attempted — a failure at either step rolls back automatically
- PM2 (`ecosystem.config.cjs`) is restarted with the new env; the process is capped at 100MB via `max_memory_restart`, reflecting the small VM this runs on


## License

MIT — see [LICENSE](LICENSE).
