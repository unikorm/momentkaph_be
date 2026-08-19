import https from 'https';
import type { SendEmailResponse } from '../handlers/email.js';

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export function sendEmail(payload: EmailPayload): Promise<SendEmailResponse> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload); // actual HTML content

    const req = https.request( // Resend API docs: https://resend.com/docs/api-reference/emails/send-email
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (c: Buffer) => {
          received += c.length;
          if (received > 1024) { // Resend API responses are tiny, so this is a cheap sanity check
            chunks = [];
            res.destroy();
            reject(new Error(`Response from Resend API too large: over 512 bytes`));
            return;
          }
          chunks.push(c)
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString()) as SendEmailResponse;
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`Resend return ${res.statusCode} and payload: ${JSON.stringify(data)}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response from Resend API: ${err instanceof Error ? err.message : String(err)}`));
          }
          chunks = [];
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
