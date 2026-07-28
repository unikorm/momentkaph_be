import type http from 'http';
import { sendEmail } from '../lib/resend.js';
import { validateContactForm, type ContactRequest } from '../lib/validate.js';
import { approvalEmailTemplate, emailFormTemplate } from '../templates/email.js';


export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
  let data: ContactRequest; // simple JSON <key:string, value:string> expected, but we validate it thoroughly in the next step

  try { // it is first line of defense against malicious payloads and malformed requests
    data = await readBody(req);
  } catch (err) {
    console.error(`[${requestId}] Failed to read request body or parse JSON`, err instanceof Error ? err.message : err);
    res.writeHead(404);
    res.end();
    return;
  }

  const result = validateContactForm(data); // check buisness rules, security and honeypot before talking to resend API
  if (result.status === 'invalid') {
  console.error(`[${requestId}] Validation errors:`, result.errors);
  res.writeHead(404);
  res.end();
  return;
}

  const { name, email, phone, message } = result.value;

  const timestamp = new Date().toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' });
  const html = emailFormTemplate({ name, email, phone, message, timestamp }); // create HTML content using the template

  try {
    await sendEmail({ // send the email via Resend API
      from: process.env.RESEND_FROM_EMAIL!,
      to: process.env.RESEND_EMAIL_RECIPIENT!,
      subject: `New request from ${name} - momentkaph.sk`,
      html,
    });
  } catch (err) {
    console.error(`[${requestId}] Email send failed:`, err instanceof Error ? err.message : err);
    res.writeHead(404);
    res.end();
    return;
  }

  try {
    const approvalHtml = approvalEmailTemplate({ name });
    await sendEmail({ // send approval confirmation to the contact form submitter
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: 'Správa prijatá / Message received – momentkaph.sk',
      html: approvalHtml,
    });
  } catch (err) {
    console.error(`[${requestId}] Approval email send failed:`, err instanceof Error ? err.message : err);
  }

  res.writeHead(200);
  res.end();
}

// helpers
function readBody(req: http.IncomingMessage): Promise<ContactRequest> {
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
