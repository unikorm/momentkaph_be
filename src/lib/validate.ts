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

export function validateContactForm(data: ContactRequest): ParseResult {

  // Guard against non-object bodies — curl -d "hello" style payloads.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { status: 'invalid', errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const raw = data as ContactRequest;

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
function parseName(value: string, errors: ValidationError[]): string {
  const name = normalize(value, 100);
  if (name.length < 3 || name.length > 100) {
    errors.push({ field: 'name', message: 'Name must be 3–100 characters' });
  }
  return name;
}

function parseEmail(value: string, errors: ValidationError[]): string {
  const email = normalize(value, 254).toLowerCase();
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (email.length > 254) { // RFC 5321 hard limit
    errors.push({ field: 'email', message: 'Email address is too long' });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }
  return email;
}

function parsePhone(value: string, errors: ValidationError[]): string {
  const phone = normalize(value, 20);
  if (!phone) {
    errors.push({ field: 'phone', message: 'Phone is required' });
  } else if (!PHONE_ALLOWED_CHARS.test(phone)) {
    errors.push({ field: 'phone', message: 'Phone contains invalid characters' });
  } else if (countDigits(phone) < 7) {
    errors.push({ field: 'phone', message: 'Phone number must contain at least 7 digits' });
  }
  return phone;
}

function parseMessage(value: string, errors: ValidationError[]): string {
  const message = normalize(value, 700);

  if (message.length < 20) {
    errors.push({ field: 'message', message: 'Message must be at least 20 characters' });
    return message;
  }
  if (message.length > 700) {
    errors.push({ field: 'message', message: 'Message must not exceed 700 characters' });
    return message;
  }

  if (isRepetitive(message)) {
    errors.push({ field: 'message', message: 'Message looks like spam (repetition)' });
    return message;
  }

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
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq / s.length > 0.6;
}

function normalize(value: string, maxRawLength: number): string {
  if (typeof value !== 'string') return '';
  const capped = value.length > maxRawLength ? value.slice(0, maxRawLength + 1) : value;
  return capped.trim().replace(/\s+/g, ' ');
}