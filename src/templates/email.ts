interface EmailTemplateData {
  name: string;
  email: string;
  phone: string;
  message: string;
  timestamp: string;
}

interface ApprovalTemplateData {
  name: string;
}

export function approvalEmailTemplate({ name }: ApprovalTemplateData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;margin:0}
  .card{background:#fff;border-radius:8px;padding:28px;max-width:560px;margin:auto;border:1px solid #e0e0e0}
  h2{margin:0 0 16px;color:#1a1a1a;font-size:18px}
  p{font-size:15px;color:#333;line-height:1.6;margin:0 0 12px}
  .footer{margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
</style>
</head>
<body>
<div class="card">
  <h2>Hi ${esc(name)}, I got your message!</h2>
  <p>Thank you for reaching out. I have received your message and will get back to you as soon as possible.</p>
  <p>Talk to you soon!</p>
  <div class="footer">momentkaph.sk</div>
</div>
</body>
</html>`;
}

export function emailFormTemplate({ name, email, phone, message, timestamp }: EmailTemplateData): string {
  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;margin:0}
  .card{background:#fff;border-radius:8px;padding:28px;max-width:560px;margin:auto;border:1px solid #e0e0e0}
  h2{margin:0 0 20px;color:#1a1a1a;font-size:18px}
  .row{margin-bottom:14px}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:4px}
  .value{font-size:15px;color:#222;white-space:pre-wrap;word-break:break-word}
  .footer{margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
</style>
</head>
<body>
<div class="card">
  <h2>New request from ${esc(name)}</h2>
  <div class="row"><div class="label">Name:</div><div class="value">${esc(name)}</div></div>
  <div class="row"><div class="label">Email:</div><div class="value">${esc(email)}</div></div>
  <div class="row"><div class="label">Phone:</div><div class="value">${esc(phone)}</div></div>
  <div class="row"><div class="label">Message:</div><div class="value">${esc(message)}</div></div>
  <div class="footer">Sent at ${esc(timestamp)} &middot; momentkaph.sk</div>
</div>
</body>
</html>`;
}


// helpers
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
