import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const bad = (code, fields) => new HttpError(400, code, fields);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code) => new HttpError(409, code);

// ---------- dates (UAE time) ----------
export const todayUAE = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------- passwords & tokens ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newLinkCode() {
  let out = '';
  for (const b of crypto.randomBytes(8)) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// ---------- validation ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * spec: { field: { t: 'str'|'int'|'num'|'date'|'time'|'enum'|'bool', min, max, opt, values } }
 * Throws 422-style bad('validation', {field: code}) with all field errors.
 */
export function validate(body, spec) {
  const out = {};
  const errors = {};
  const src = body && typeof body === 'object' ? body : {};
  for (const [k, s] of Object.entries(spec)) {
    let v = src[k];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (s.opt) {
        out[k] = s.t === 'str' ? '' : null;
        continue;
      }
      errors[k] = 'required';
      continue;
    }
    switch (s.t) {
      case 'str': {
        if (typeof v !== 'string') { errors[k] = 'invalid'; break; }
        v = v.normalize('NFC').trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '');
        if (s.min && v.length < s.min) errors[k] = 'too_short';
        else if (s.max && v.length > s.max) errors[k] = 'too_long';
        else out[k] = v;
        break;
      }
      case 'int':
      case 'num': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || (s.t === 'int' && !Number.isInteger(n))) errors[k] = 'invalid';
        else if ((s.min !== undefined && n < s.min) || (s.max !== undefined && n > s.max)) errors[k] = 'out_of_range';
        else out[k] = n;
        break;
      }
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) errors[k] = 'invalid';
        else out[k] = v;
        break;
      case 'time':
        if (typeof v !== 'string' || !TIME_RE.test(v)) errors[k] = 'invalid';
        else out[k] = v;
        break;
      case 'enum':
        if (!s.values.includes(v)) errors[k] = 'invalid';
        else out[k] = v;
        break;
      case 'bool':
        out[k] = v === true || v === 'true' || v === 1;
        break;
      default:
        errors[k] = 'invalid';
    }
  }
  if (Object.keys(errors).length) throw bad('validation', errors);
  return out;
}

export const hoursBetween = (start, end) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
};

// ---------- csv ----------
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- rate limit ----------
export function makeLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const t = Date.now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, a] of hits) if (!a.some((x) => t - x < windowMs)) hits.delete(k);
    return arr.length <= limit;
  };
}
