export interface ValidationError {
  field: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s\-]{10,}$/;

export function validateEmailForm(data: unknown): ValidationError[] {
  if (!data || typeof data !== 'object') return [{ field: 'body', message: 'Invalid body' }];

  const { name, email, phone, message } = data as Record<string, unknown>;
  const errors: ValidationError[] = [];

  const nameStr = typeof name === 'string' ? name.trim() : '';
  if (!nameStr || nameStr.length < 3 || nameStr.length > 100)
    errors.push({ field: 'name', message: 'Name must be 3–100 characters' });

  const emailStr = typeof email === 'string' ? email.trim() : '';
  if (!emailStr || !EMAIL_RE.test(emailStr) || emailStr.length > 254)
    errors.push({ field: 'email', message: 'Invalid email address' });

  const phoneStr = typeof phone === 'string' ? phone.trim() : '';
  if (!phoneStr || !PHONE_RE.test(phoneStr))
    errors.push({ field: 'phone', message: 'Invalid phone number (min 10 digits)' });

  const msgStr = typeof message === 'string' ? message.trim() : '';
  if (!msgStr || msgStr.length < 20 || msgStr.length > 700)
    errors.push({ field: 'message', message: 'Message must be 20–700 characters' });

  return errors;
}
