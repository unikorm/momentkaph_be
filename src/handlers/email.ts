import type http from 'http';
import { sendEmail } from '../lib/resend.js';
import { validateContactForm, type ContactRequest } from '../lib/validate.js';
import { approvalTemplate, emailFormTemplate } from '../templates/email.js';

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — nginx caps this too, this is the in-app second line of defense


export async function emailHandler(req: http.IncomingMessage, res: http.ServerResponse, requestId: string): Promise<void> {
  let data: ContactRequest; // simple JSON <key:string, value:string> expected, but we validate it thoroughly in the next step

  try {
    data = await readBody(req); // it is first line of defense against malicious payloads and malformed requests
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

    // Fire-and-forget: the submitter already has their 200, so the confirmation
    // mail must not hold the request open. Failures are logged, never surfaced.
    void sendApprovalEmail(email, name, requestId);
  } catch (err) {
    console.error(`[${requestId}] Email send failed:`, err instanceof Error ? err.message : err);
    res.writeHead(404);
    res.end();
  }
}

// helpers
async function sendApprovalEmail(to: string, name: string, requestId: string): Promise<void> {
  let html = '';
  try {
    html = approvalTemplate({ name });
    await sendEmail({
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject: 'Ďakujem za správu - momentkaph.sk',
      html,
    });
  } catch (err) { // best effort only — the contact form itself already succeeded
    console.error(`[${requestId}] Approval email send failed:`, err instanceof Error ? err.message : err);
  }
}

function readBody(req: http.IncomingMessage): Promise<ContactRequest> {
  return new Promise((resolve, reject) => {
    console.log(req.headers);
    const contentType = (req.headers['content-type'] ?? '').trim();
    if (!/^application\/json\s*(?:;|$)/i.test(contentType)) { // only JSON bodies, charset parameter allowed
      req.pause(); // stop pulling the body in, the handler answers 404 and node closes the socket
      req.removeAllListeners();
      req.resume(); // resume the stream so that node can close the socket gracefully, otherwise it hangs for a while before closing
      reject(new Error(`Unsupported Content-Type: ${contentType || 'missing'}`));
      return;
    }

    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) { // cheap reject before reading a single byte
      req.pause();
      req.removeAllListeners();
      reject(new Error(`Payload too large: ${declaredLength} bytes declared`));
      return;
    }

    let chunks: Buffer[] = [];
    let received = 0;

    req.on('data', (c: Buffer) => {
      received += c.length;
      if (received > MAX_BODY_BYTES) { // chunked/lying senders get caught here
        chunks = [];
        req.pause();
        req.removeAllListeners();
        reject(new Error(`Payload too large, content-length lying: over ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(c);
    });

    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
      finally { chunks = []; } // release the buffered body either way
    });

    req.on('error', (err) => {
      chunks = [];
      reject(err);
    });
  });
}
