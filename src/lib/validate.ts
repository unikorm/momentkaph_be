interface ValidationError {
  field: string;
  message: string;
}

export interface ContactRequest {
  name: string;
  email: string;
  phone: string;
  message: string;
  approval?: string; // hidden honeypot field — should always be empty
}

export type ParseResult =
  | { status: 'ok'; value: ContactRequest }
  | { status: 'invalid'; errors: ValidationError[] }

export function validateContactForm(data: unknown): ParseResult {

  // Guard against non-object bodies — curl -d "hello" style payloads.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const raw = data as Record<string, unknown>;

  if (typeof raw.approval === 'string' && raw.approval.trim().length > 0) {
    return { status: 'invalid', errors: [{ field: 'approval', message: 'Honeypot field must be empty' }] };
  }

  // Each field gets its own small parser: it returns the CLEAN value and pushes
  // any problems into the shared list. Keeping each field's rules in one spot
  // is most of what makes this readable.
  const errors: ValidationError[] = [];
  const name = parseName(raw.name, errors);
  const email = parseEmail(raw.email, errors);
  const phone = parsePhone(raw.phone, errors);
  const message = parseMessage(raw.message, errors);

  if (errors.length > 0) return { status: 'invalid', errors };

  // We only get here when every field parsed cleanly, so this genuinely
  // satisfies ContactRequest — no casting, no lying to the type system.
  return { status: 'ok', value: { name, email, phone, message } };
}

// helpers
function parseName(value: unknown, errors: ValidationError[]): string {
  const name = normalize(value, 200); // raw-cap guards against giant payloads
  if (name.length < 3 || name.length > 100) {
    errors.push({ field: 'name', message: 'Name must be 3–100 characters' });
  }
  return name;
}

function parseEmail(value: unknown, errors: ValidationError[]): string {
  const email = normalize(value, 300).toLowerCase();
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (email.length > 254) { // RFC 5321 hard limit
    errors.push({ field: 'email', message: 'Email address is too long' });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }
  return email;
}

function parsePhone(value: unknown, errors: ValidationError[]): string {
  const phone = normalize(value, 50);
  if (!phone) {
    errors.push({ field: 'phone', message: 'Phone is required' });
  } else if (!PHONE_ALLOWED_CHARS.test(phone)) {
    errors.push({ field: 'phone', message: 'Phone contains invalid characters' });
  } else if (countDigits(phone) < 7) {
    errors.push({ field: 'phone', message: 'Phone number must contain at least 7 digits' });
  }
  return phone;
}

function parseMessage(value: unknown, errors: ValidationError[]): string {
  const message = normalize(value, 1500); // raw-cap well above the 700 limit

  // 1. Length — the plain business rule. Bail before the heuristics, since
  //    running spam checks on a too-short string is pointless.
  if (message.length < 20) {
    errors.push({ field: 'message', message: 'Message must be at least 20 characters' });
    return message;
  }
  if (message.length > 700) {
    errors.push({ field: 'message', message: 'Message must not exceed 700 characters' });
    return message;
  }

  // 2. Repetition — "aaaaaaaa" or one char dominating the whole string. A real
  //    enquiry never trips this; junk often does.
  if (isRepetitive(message)) {
    errors.push({ field: 'message', message: 'Message looks like spam (repetition)' });
    return message;
  }

  // 3. Link flooding — the single most useful contact-form spam signal. A real
  //    "can you shoot my wedding?" rarely has links; SEO/backlink spam is mostly
  //    links. Allow one, reject on two or more.
  if (countLinks(message) > 1) {
    errors.push({ field: 'message', message: 'Message looks like spam (links)' });
    return message;
  }

  return message;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_CHARS = /^[\d\s+\-().]{7,30}$/;

function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function countLinks(s: string): number {
  return (s.match(/https?:\/\/|www\./gi) ?? []).length;
}

function isRepetitive(s: string): boolean {
  if (s.length < 10) return false; // short strings look lopsided even when fine
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq / s.length > 0.6;
}

// One normalizer for every field: reject non-strings, cap raw length BEFORE
// trimming (so trim() never runs across a 10 MB payload), then trim and
// collapse whitespace runs.
//
// What it deliberately does NOT do: strip or escape HTML. Escaping belongs to
// whoever RENDERS the value, because the correct escaping depends on where the
// text lands — an HTML email needs HTML-entity escaping, a plain-text email or
// a log line needs none. Baking "strip <tags>" in here would silently mangle a
// message that legitimately contains "<3" or "x < y", and would still be the
// wrong tool the day you add a plain-text email. So we keep meaning here and
// push escaping to the boundary — see escapeHtml below.
function normalize(value: unknown, maxRawLength: number): string {
  if (typeof value !== 'string') return '';
  const capped = value.length > maxRawLength ? value.slice(0, maxRawLength + 1) : value;
  return capped.trim().replace(/\s+/g, ' ');
}