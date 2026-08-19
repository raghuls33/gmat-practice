/*
 * Signup validation, shared by the Worker and the test suite.
 *
 * Deliberately free of imports, DOM and Worker globals: test.js evaluates this
 * file in a vm context (stripping the `export` keywords) the same way it
 * evaluates src/app.js, so the tests exercise the code that actually ships.
 */

export const LIMITS = { name: 80, email: 254, note: 500 };

/* Not an RFC 5322 parser — deliberately. A stricter regex rejects addresses
   that are perfectly deliverable, and the only thing that truly proves an
   address works is sending to it. This rejects the obviously malformed. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* eslint-disable-next-line no-control-regex */
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export function normaliseEmail(raw) {
  return String(raw == null ? '' : raw).trim().toLowerCase();
}

export function normaliseName(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
}

/*
 * Returns { ok, errors, value }. `errors` is keyed by field so the form can
 * put each message next to the input it belongs to.
 */
export function validateSignup(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};

  const name = normaliseName(src.name);
  const email = normaliseEmail(src.email);
  const note = String(src.note == null ? '' : src.note).trim();

  if (!name) errors.name = 'Please enter a name.';
  else if (name.length > LIMITS.name) errors.name = 'Name must be ' + LIMITS.name + ' characters or fewer.';
  else if (CONTROL_RE.test(name)) errors.name = 'Name contains characters that are not allowed.';

  if (!email) errors.email = 'Please enter an email address.';
  else if (email.length > LIMITS.email) errors.email = 'Email address is too long.';
  else if (!EMAIL_RE.test(email)) errors.email = 'That does not look like an email address.';

  if (note.length > LIMITS.note) errors.note = 'Message must be ' + LIMITS.note + ' characters or fewer.';

  if (src.consent !== true) errors.consent = 'Please tick the box to agree to your details being stored.';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, email, note }
  };
}

/* Bots fill in every field they can see, including ones hidden from humans.
   A non-empty honeypot means "silently discard" — never an error message,
   which would just teach the bot to leave it blank next time. */
export function isHoneypotTripped(input) {
  const src = input && typeof input === 'object' ? input : {};
  return String(src.website == null ? '' : src.website).trim() !== '';
}
