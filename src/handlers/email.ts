import type http from 'http';
import { sendEmail } from '../lib/resend.js';
import { validateContactForm, type ContactRequest } from '../lib/validate.js';
import { emailFormTemplate, approvalEmailTemplate } from '../templates/email.js';

const MAX_BODY_BYTES = 16 * 1024; // 16 KB

export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {

  // Defense check: Content-Type must be application/json and payload must not exceed 16 KB
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    console.error(`[${requestId}] Rejected: unexpected Content-Type "${contentType}"`);
    res.writeHead(404);
    res.end();
    return;
  }
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    console.error(`[${requestId}] Rejected: Content-Length ${contentLength} exceeds 16 KB`);
    res.writeHead(404);
    res.end();
    return;
  }

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
    res.writeHead(200);
    res.end();
    // Fire-and-forget: send approval email to the submitter independently — if it fails, just log it
    sendEmail({
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: 'I got your message – momentkaph.sk',
      html: approvalEmailTemplate({ name }),
    }).catch(approvalErr => {
      const errMsg = approvalErr instanceof Error ? approvalErr.message : String(approvalErr);
      console.error(`[${requestId}] Approval email failed: ${errMsg}`);
    });
  } catch (err) {
    console.error(`[${requestId}] Email send failed:`, err instanceof Error ? err.message : err);
    res.writeHead(404);
    res.end();
  }
}

// helpers
function readBody(req: http.IncomingMessage): Promise<ContactRequest> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
      finally { chunks.length = 0; } // free buffer memory
    });
    req.on('error', reject);
  });
}
