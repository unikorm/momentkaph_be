import type http from 'http';
import { sendEmail } from '../lib/resend.js';
import { validateContactForm } from '../lib/validate.js';
import { approvalEmailTemplate, emailFormTemplate } from '../templates/email.js';

const BODY_SIZE_LIMIT = 8192; // 8 KB is plenty for a contact form

export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
  let status = 500; // fail closed — any unhandled path returns 500
  const start = Date.now();

  try {
    const ct = req.headers['content-type'] ?? '';
    if (!ct.includes('application/json')) {
      status = 400;
      return;
    }

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (err) {
      console.error(`[${requestId}] Failed to read request body:`, err instanceof Error ? err.message : err);
      status = 400;
      return;
    }

    const result = validateContactForm(body); // check business rules, security and honeypot before talking to Resend API

    if (result.status === 'honeypot') {
      status = 200; // silent success — bot learns nothing and moves on
      return;
    }

    if (result.status === 'invalid') {
      console.error(`[${requestId}] Validation errors:`, result.errors);
      status = 400;
      return;
    }

    const { name, email, phone, message } = result.value;

    const timestamp = new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' });
    const html = emailFormTemplate({ name, email, phone, message, timestamp }); // create HTML content using the template

    try {
      await sendEmail({ // send the email via Resend API — this is the commit point
        from: process.env.RESEND_FROM_EMAIL!,
        to: process.env.RESEND_EMAIL_RECIPIENT!,
        subject: `New request from ${name} - momentkaph.sk`,
        html,
      });
    } catch (err) {
      console.error(`[${requestId}] Email send failed:`, err instanceof Error ? err.message : err);
      status = 502;
      return;
    }

    // fire-and-forget — acknowledgement is a courtesy; it must never hold up the response
    const approvalHtml = approvalEmailTemplate({ name });
    void sendEmail({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: 'Správa prijatá / Message received – momentkaph.sk',
      html: approvalHtml,
    }).catch((err: unknown) => {
      console.error(`[${requestId}] Approval email send failed:`, err instanceof Error ? err.message : err);
    });

    status = 200;
  } finally {
    if (!res.headersSent) res.writeHead(status);
    if (!res.writableEnded) res.end();
    console.log(`[${requestId}] responded ${status} in ${Date.now() - start}ms`);
  }
}

// helpers
function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let destroyed = false;
    req.on('data', (c: Buffer) => {
      if (destroyed) return;
      size += c.length;
      if (size > BODY_SIZE_LIMIT) {
        destroyed = true;
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (destroyed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
