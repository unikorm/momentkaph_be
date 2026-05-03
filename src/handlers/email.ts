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

export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let data: unknown;
  try {
    data = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const errors = validateEmailForm(data);
  if (errors.length > 0) {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ errors }));
    return;
  }

  const body    = data as Record<string, string>;
  const name    = body.name.trim();
  const email   = body.email.trim().toLowerCase();
  const phone   = body.phone.trim();
  const message = body.message.trim();

  const timestamp = new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const html      = emailFormTemplate({ name, email, phone, message, timestamp });

  try {
    await sendEmail({
      from:    process.env.RESEND_FROM_EMAIL!,
      to:      process.env.CONTACT_FORM_RECIPIENT_EMAIL!,
      subject: `New request from ${name} - momentkaph.sk`,
      html,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: true }));
  } catch (err) {
    console.error('Email send failed:', err instanceof Error ? err.message : err);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: false }));
  }
}
