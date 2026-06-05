import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudStorageHandler } from './handlers/cloudStorage.js';
import { emailHandler } from './handlers/email.js';

// Load .env before anything else
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const PORT = process.env.PORT || '3000';

const mustBeHeaders: Record<string, string> = process.env.NODE_ENV !== 'production' ? {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:4200',
  'Access-Control-Allow-Methods': process.env.CORS_METHODS || 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': process.env.CORS_HEADERS || 'Content-Type',
  'Access-Control-Max-Age': process.env.CORS_MAX_AGE || '3600',
} : {};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(mustBeHeaders)) res.setHeader(k, v);

  if (process.env.NODE_ENV !== 'production' && req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestId = req.headers['x-request-id'] ?? 'no-request-id';
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

    console.error(`[${requestId}] No handler for ${req.method} ${pathname}`);
    res.writeHead(404);
    res.end();
  } catch (err) {
    console.error(`[${requestId}]`, err);
    res.writeHead(500);
    res.end();
  }
});

server.listen(parseInt(PORT), () => console.log(`momentkaph_be listening on port ${PORT}`));
