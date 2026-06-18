import crypto from 'crypto';
import https from 'https';

export async function listObjects(galleryType: string): Promise<string[]> {
  const host = process.env.CLOUD_STORAGE_BUCKET_ENDPOINT!;
  const query = `list-type=2&prefix=${encodeURIComponent(`${galleryType}/`)}`;
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
  const host = process.env.CLOUD_STORAGE_BUCKET_ENDPOINT!;
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

// helpers
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function encodePathSegment(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodePath(key: string): string {
  return '/' + key.split('/').map(encodePathSegment).join('/');
}

function signHeaders(method: string, host: string, path: string, query: string, headers: Record<string, string>, bodyHash: string): Record<string, string> {
  const accessKeyId = process.env.CLOUD_STORAGE_BUCKET_ACCESS_KEY_ID!;
  const secretKey = process.env.CLOUD_STORAGE_BUCKET_SECRET_KEY!;
  const region = process.env.CLOUD_STORAGE_BUCKET_REGION!;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
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

  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateStamp), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

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
