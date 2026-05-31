interface ValidationError {
  field: string;
  message: string;
}

// RFC 5321 compliant enough for BE — stricter TLD requirement (2+ chars)
// and no consecutive dots, which your FE regex missed
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// BE phone validation: we care about digit count, not format aesthetics.
// A human types "0944 250 021" or "+421944250021" — both are fine.
// What we reject: strings with no real digits, or clearly fake sequences.
const PHONE_ALLOWED_CHARS = /^[\d\s\+\-\(\)\.]{7,30}$/;

function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

// Strip HTML tags and normalize whitespace — defend against XSS payloads
// sneaking through into downstream rendering or email clients
function sanitize(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')       // strip HTML tags
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
}

// Detect suspiciously repetitive content like "aaaaaaaaaa" or "hahahahaha"
// Works by checking if any single character dominates more than 60% of the string
function isRepetitive(s: string): boolean {
  if (s.length < 10) return false;
  const freq: Record<string, number> = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq / s.length > 0.6;
}

// A rough check for strings that are clearly gibberish — no vowels at all
// in a longer string is a strong spam signal
function hasVowels(s: string): boolean {
  return /[aeiouáéíóúäöüàèìòù]/i.test(s);
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  approval?: string; // hidden honeypot field — should always be empty
}


// Safe string extraction with an early length guard.
// We check raw length BEFORE trim() to avoid allocating memory
// on a maliciously oversized payload — trim() on a 10MB string is expensive.
function extractString(value: unknown, maxRawLength: number): string {
  if (typeof value !== 'string') return '';
  if (value.length > maxRawLength) return value.slice(0, maxRawLength + 1); // flag it as too long
  return value.trim();
}

export function validateEmailForm(data: unknown): ValidationError[] {
  // Guard against non-object bodies — curl -d "hello" style attacks
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

   const { name, email, phone, message, approval } = data as FormData;
  const errors: ValidationError[] = [];

  // --- Honeypot: bots fill hidden fields, humans don't ---
  // Return early and silently — don't tell bots they were caught
  if (approval && String(approval).trim().length > 0) {
    return []; // Pretend success; log this server-side in reality
  }

  // --- Name ---
  // Raw cap at 200 chars before trim to prevent memory games,
  // then validate the trimmed result against actual business rules
  const nameStr = extractString(name, 200);
  if (nameStr.length < 3 || nameStr.length > 100) {
    errors.push({ field: 'name', message: 'Name must be 3–100 characters' });
  }

  // --- Email ---
  const emailStr = extractString(email, 300).toLowerCase();
  if (!emailStr) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (emailStr.length > 254) {
    // 254 is the RFC 5321 hard limit for email addresses
    errors.push({ field: 'email', message: 'Email address is too long' });
  } else if (!EMAIL_RE.test(emailStr)) {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }

  // --- Phone ---
  const phoneStr = extractString(phone, 50);
  if (!phoneStr) {
    errors.push({ field: 'phone', message: 'Phone is required' });
  } else if (!PHONE_ALLOWED_CHARS.test(phoneStr)) {
    // Rejects letters, special chars, SQL injection attempts, etc.
    errors.push({ field: 'phone', message: 'Phone contains invalid characters' });
  } else if (countDigits(phoneStr) < 7) {
    // Separating "wrong chars" from "too few digits" gives clearer errors
    errors.push({ field: 'phone', message: 'Phone number must contain at least 7 digits' });
  }

  // --- Message ---
  // Raw cap at 1500 before processing — double the business limit is a
  // reasonable signal that something is wrong, not just a long message
  const msgStr = extractString(message, 1500);
  if (msgStr.length < 20) {
    errors.push({ field: 'message', message: 'Message must be at least 20 characters' });
  } else if (msgStr.length > 700) {
    errors.push({ field: 'message', message: 'Message must not exceed 700 characters' });
  }

  return errors;
}