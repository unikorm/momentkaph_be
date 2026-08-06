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

/* ── shared bits ───────────────────────────────────────────── */

const BODY = "Arial, Helvetica, sans-serif";
const HEAD = "Georgia, 'Times New Roman', Times, serif";

function row(label: string, value: string, first = false): string {
  return `
      <tr>
        <td style="padding:${first ? '0' : '16px'} 0 0;">
          <div style="font-family:${BODY};font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#7c8c68;padding-bottom:5px;">${label}</div>
          <div style="font-family:${BODY};font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#201e1d;word-break:break-word;">${value}</div>
        </td>
      </tr>
      <tr><td style="padding-top:16px;border-bottom:1px solid #eae3d6;font-size:0;line-height:0;">&nbsp;</td></tr>`;
}

/* ── 1. notification to the site owner ─────────────────────── */

export function emailFormTemplate({ name, email, phone, message, timestamp }: EmailTemplateData): string {
  const n = esc(name), e = esc(email), p = esc(phone);
  const msg = esc(message).replace(/\r?\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Nová správa – ${n}</title>
</head>
<body style="margin:0;padding:0;background:#f2ece2;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2ece2;font-size:1px;line-height:1px;">${n} · ${e} · ${p} — nová správa z kontaktného formulára.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2ece2;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#fffdf9;border:1px solid #e6ddcd;border-radius:20px;">

    <tr><td style="padding:20px 32px;background:#b4744e;border-radius:20px 20px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" style="font-family:${HEAD};font-size:17px;letter-spacing:0.4px;color:#fffaf4;">momentka<span style="color:#eccfb6;">ph</span></td>
        <td align="right" style="font-family:${BODY};font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#f0dcc6;">Kontaktný formulár</td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:34px 32px 4px;">
      <h1 style="margin:0;font-family:${HEAD};font-weight:normal;font-size:27px;line-height:34px;mso-line-height-rule:exactly;color:#201e1d;">Nová správa – ${n}</h1>
      <p style="margin:8px 0 0;font-family:${BODY};font-size:14px;line-height:20px;color:#8a7d6d;">New request from the contact form</p>
    </td></tr>

    <tr><td style="padding:22px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${row('Meno / Name', n, true)}
        ${row('E-mail', `<a href="mailto:${e}" style="color:#9a6039;text-decoration:underline;">${e}</a>`)}
        ${row('Telefón / Phone', `<a href="tel:${p.replace(/\s/g, '')}" style="color:#9a6039;text-decoration:none;">${p}</a>`)}
      </table>
    </td></tr>

    <tr><td style="padding:22px 32px 0;">
      <div style="font-family:${BODY};font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#7c8c68;padding-bottom:8px;">Správa / Message</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e9eee3;border-radius:16px;">
        <tr><td style="padding:18px 20px;font-family:${BODY};font-size:16px;line-height:25px;mso-line-height-rule:exactly;color:#262a20;word-break:break-word;">${msg}</td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:26px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#b4744e" style="border-radius:999px;">
          <a href="mailto:${e}?subject=Re:%20Va%C5%A1a%20spr%C3%A1va%20%E2%80%93%20momentkaph.sk" style="display:block;padding:14px 30px;font-family:${BODY};font-size:15px;font-weight:bold;color:#fffaf4;text-decoration:none;border-radius:999px;">Odpovedať</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:28px 32px 30px;">
      <div style="border-top:1px solid #eae3d6;padding-top:14px;font-family:${BODY};font-size:12px;line-height:18px;color:#9b8f80;">
        Prijaté ${esc(timestamp)} · <a href="https://momentkaph.sk" style="color:#9b8f80;text-decoration:underline;">momentkaph.sk</a>
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/* ── 2. confirmation back to the sender ────────────────────── */

export function approvalTemplate({ name }: ApprovalTemplateData): string {
  const n = esc(name);

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Správa prijatá – momentkaph.sk</title>
</head>
<body style="margin:0;padding:0;background:#f2ece2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2ece2;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#fffdf9;border:1px solid #e6ddcd;border-radius:20px;">

    <tr><td style="padding:20px 32px;background:#b4744e;border-radius:20px 20px 0 0;"display:flex;justify-content:space-between;align-items:center;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" style="font-family:${HEAD};font-size:17px;letter-spacing:0.4px;color:#fffaf4;">momentka<span style="color:#eccfb6;">ph</span></td>
        <td align="right" style="font-family:${BODY};font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#f0dcc6;">Správa prijatá</td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:38px 32px 0;">
      <h1 style="margin:0;font-family:${HEAD};font-weight:normal;font-size:29px;line-height:37px;mso-line-height-rule:exactly;color:#201e1d;">Ďakujem za správu, ${n}!</h1>
      <p style="margin:14px 0 0;font-family:${BODY};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#463f38;">Vašu správu som dostala a čoskoro sa Vám ozvem — zvyčajne do 24 hodín. Ak je to súrne, pokojne mi zavolajte.</p>
    </td></tr>

    <tr><td style="padding:26px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#b4744e" style="border-radius:999px;">
          <a href="https://momentkaph.sk" style="display:block;padding:14px 30px;font-family:${BODY};font-size:15px;font-weight:bold;color:#fffaf4;text-decoration:none;border-radius:999px;">Pozrieť portfólio</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:30px 32px 30px;">
      <div style="border-top:1px solid #eae3d6;padding-top:14px;font-family:${BODY};font-size:12px;line-height:19px;color:#9b8f80;">
        Táto správa je automatické potvrdenie — nemusíte na ňu odpovedať.<br>
        <a href="https://momentkaph.sk" style="color:#9b8f80;text-decoration:underline;">momentkaph.sk</a>
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/* ── helper ────────────────────────────────────────────────── */

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
