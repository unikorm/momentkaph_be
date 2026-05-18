import type http from 'http';
import { sendEmail } from '../lib/resend.js';
import { validateEmailForm } from '../lib/validate.js';
import { emailFormTemplate } from '../templates/email.js';

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
  let data: unknown;
  try {
    data = await readBody(req);
  } catch (err) {
    console.error(`[${requestId}] Failed to read request body or parse JSON`, err instanceof Error ? err.message : err);
    res.writeHead(404);
    res.end();
    return;
  }

  const errors = validateEmailForm(data);
  if (errors.length > 0) {
    console.error(`[${requestId}] Validation errors:`, errors);
    res.writeHead(404);
    res.end();
    return;
  }

  const body = data as Record<string, string>;
  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();
  const phone = body.phone.trim();
  const message = body.message.trim();

  const timestamp = new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const html = emailFormTemplate({ name, email, phone, message, timestamp });

  try {
    await sendEmail({
      from: process.env.RESEND_FROM_EMAIL!,
      to: process.env.RESEND_EMAIL_RECIPIENT!,
      subject: `New request from ${name} - momentkaph.sk`,
      html,
    });
    res.writeHead(200);
    res.end();
  } catch (err) {
    console.error(`[${requestId}] Email send failed:`, err instanceof Error ? err.message : err);
    res.writeHead(400);
    res.end();
  }
}
