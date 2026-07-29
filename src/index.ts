import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudStorageHandler } from './handlers/cloudStorage.js';
import { emailHandler } from './handlers/email.js';

// Load .env before anything else
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== 'production') {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;
      const key = trimmed.slice(0, equals).trim();
      let val = trimmed.slice(equals + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}

// Validate required env vars once at startup — a missing var surfaces here as a
// loud crash rather than a confusing Resend 4xx on the first real submission.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

requireEnv('PORT');
requireEnv('RESEND_API_KEY');
requireEnv('RESEND_FROM_EMAIL');
requireEnv('RESEND_EMAIL_RECIPIENT');

const PORT = process.env.PORT!;

const mustBeHeaders: Record<string, string> = process.env.NODE_ENV !== 'production' ? {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN!,
  'Access-Control-Allow-Methods': process.env.CORS_METHODS!,
  'Access-Control-Allow-Headers': process.env.CORS_HEADERS!,
  'Access-Control-Max-Age': process.env.CORS_MAX_AGE!,
} : {};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(mustBeHeaders)) res.setHeader(k, v);

  if (process.env.NODE_ENV !== 'production' && req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestId = (() => {
    const raw = req.headers['x-request-id'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    // strip control chars and `%` so requestId is safe to embed in console format strings
    return typeof value === 'string' ? value.replace(/[^\x20-\x7E]/g, '').replace(/%/g, '') : 'no-request-id';
  })();
  const pathname = new URL(req.url ?? '/', `http://x`).pathname;

  try {
    const galleryMatch = pathname.match(/^\/cloud_storage\/([^/]+)$/);
    if (req.method === 'GET' && galleryMatch) {
      await cloudStorageHandler(res, galleryMatch[1], requestId.toString());
      return;
    }

    if (req.method === 'POST' && pathname === '/email_sending') {
      await emailHandler(req, res, requestId.toString());
      return;
    }

    console.error('[%s] No handler for %s %s', requestId, req.method, pathname);
    res.writeHead(404);
    res.end();
  } catch (err) {
    console.error('[%s]', requestId, err);
    if (!res.headersSent) res.writeHead(500);
    if (!res.writableEnded) res.end();
  }
});

server.listen(parseInt(PORT), () => console.log(`momentkaph_be listening on port ${PORT}`));
