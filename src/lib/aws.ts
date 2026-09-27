import crypto from 'crypto';
import https from 'https';

// Browser-facing URLs are signed at the start of a fixed 6h UTC block
// (00:00, 06:00, 12:00, 18:00). Every call inside the same block yields
// byte-identical URLs, so browsers can reuse their cached images.
//
// Validity is counted from the block start, so at the moment a URL is
// handed out it always has between 6h and 12h left.
const SIGNING_WINDOW_MS = 6 * 60 * 60 * 1000;
const URL_VALIDITY_S = 12 * 60 * 60;

export async function listObjects(galleryType: string): Promise<string[]> {
  const host = process.env.CLOUD_STORAGE_BUCKET_HOST!;
  const query = `list-type=2&prefix=${encodeURIComponent(`${galleryType}/full/`)}`;
  const bodyHash = sha256('');

  const headers = signHeaders('GET', host, '/', query, {}, bodyHash);

  const { status, body } = await httpsGet(host, `/?${query}`, headers);
  if (status !== 200) throw new Error(`S3 listObjects failed: ${status} ${body.toString()}`);

  const xml = body.toString();
  const keys: string[] = [];
  const re = /<Key>([^<]+)<\/Key>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) keys.push(m[1]);
  return keys;
}

export async function getObjectRange(key: string, bytes = 10239): Promise<Buffer> {
  const host = process.env.CLOUD_STORAGE_BUCKET_HOST!;
  const objPath = encodePath(key);
  const bodyHash = sha256('');

  const headers = signHeaders(
    'GET',
    host,
    objPath,
    '',
    { range: `bytes=0-${bytes - 1}` },
    bodyHash,
  );

  const { status, body } = await httpsGet(host, objPath, headers);
  if (status !== 200 && status !== 206) throw new Error(`S3 getObject failed: ${status}`);
  return body;
}

/**
 * Presigned GET URL for a browser <img>.
 *
 * Same SigV4 algorithm as signHeaders, with the signature moved from the
 * Authorization header into the query string. Deterministic within a
 * signing window: same key + same window = same URL.
 */
export function presignGet(key: string, now: number = Date.now()): string {
  const host = process.env.CLOUD_STORAGE_BUCKET_HOST!;
  const accessKeyId = process.env.CLOUD_STORAGE_BUCKET_ACCESS_KEY_ID!;
  const region = process.env.CLOUD_STORAGE_BUCKET_REGION!;

  const windowStart = new Date(Math.floor(now / SIGNING_WINDOW_MS) * SIGNING_WINDOW_MS);
  const amzDate = toAmzDate(windowStart);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const path = encodePath(key);

  // Canonical query string: parameters sorted by name, names and values
  // URI-encoded. This order is already alphabetical.
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(URL_VALIDITY_S)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
    .map(([k, v]) => `${k}=${encodePathSegment(v)}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    path,
    query,
    `host:${host}\n`,   // canonical headers block, newline-terminated
    'host',             // signed headers
    'UNSIGNED-PAYLOAD', // the browser's request can't be hashed in advance
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = crypto
    .createHmac('sha256', signingKey(dateStamp, region))
    .update(stringToSign)
    .digest('hex');

  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}

// helpers
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// 2026-09-27T12:00:00.000Z -> 20260927T120000Z
function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signingKey(dateStamp: string, region: string): Buffer {
  const secretKey = process.env.CLOUD_STORAGE_BUCKET_SECRET_KEY!;
  return hmac(hmac(hmac(hmac('AWS4' + secretKey, dateStamp), region), 's3'), 'aws4_request');
}

function encodePathSegment(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodePath(key: string): string {
  return '/' + key.split('/').map(encodePathSegment).join('/');
}

// Header-based signing for Node's own requests to Scaleway. Uses the
// current time, not the window: these requests are sent immediately.
function signHeaders(method: string, host: string, path: string, query: string, headers: Record<string, string>, bodyHash: string): Record<string, string> {
  const accessKeyId = process.env.CLOUD_STORAGE_BUCKET_ACCESS_KEY_ID!;
  const region = process.env.CLOUD_STORAGE_BUCKET_REGION!;

  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);

  const allHeaders: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': bodyHash,
    ...headers,
  };

  const sortedKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${allHeaders[k].trim()}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, bodyHash].join('\n');

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const signature = crypto
    .createHmac('sha256', signingKey(dateStamp, region))
    .update(stringToSign)
    .digest('hex');

  return {
    ...allHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<{ status: number, body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}