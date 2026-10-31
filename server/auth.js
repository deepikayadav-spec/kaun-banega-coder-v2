// Sessions are httpOnly cookies holding a random token; only its SHA-256 is stored (sessions table).
// Students: NIAT ID + name, matched against the master list (Saturday Sprint "simple" mode).
// Admins: email + password (scrypt), roles admin | super_admin, optionally limited to one university.
import crypto from 'node:crypto';
import { config } from './config.js';
import { one, run } from './db.js';

export const STUDENT_COOKIE = 'kbc_session';
export const ADMIN_COOKIE = 'kbc_admin';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(res, kind, subjectId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ms = kind === 'admin' ? config.adminSessionHours * 3600e3 : config.studentSessionDays * 864e5;
  const now = Date.now();
  await run('INSERT INTO sessions (token_hash, kind, subject_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', sha(token), kind, String(subjectId), now, now + ms);
  res.cookie(kind === 'admin' ? ADMIN_COOKIE : STUDENT_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: ms, path: '/' });
}

export async function endSession(req, res, kind) {
  const name = kind === 'admin' ? ADMIN_COOKIE : STUDENT_COOKIE, t = readCookie(req, name);
  if (t) await run('DELETE FROM sessions WHERE token_hash = ?', sha(t));
  res.clearCookie(name, { path: '/' });
}

export function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function sessionFor(req, kind) {
  const t = readCookie(req, kind === 'admin' ? ADMIN_COOKIE : STUDENT_COOKIE);
  if (!t) return null;
  const s = await one('SELECT subject_id, expires_at FROM sessions WHERE token_hash = ? AND kind = ?', sha(t), kind);
  if (!s || s.expires_at < Date.now()) return null;
  return s.subject_id;
}

export async function requireStudent(req, res, next) {
  try {
    const roll = await sessionFor(req, 'student');
    const st = roll && await one('SELECT roll_no, name, university, batch, active FROM students_master WHERE roll_no = ?', roll);
    if (!st || !st.active) return res.status(401).json({ error: 'Please log in.' });
    req.student = st;
    next();
  } catch (e) { next(e); }
}

export async function requireAdmin(req, res, next) {
  try {
    const id = await sessionFor(req, 'admin');
    const a = id && await one('SELECT id, email, name, role, university, status, must_change_pw FROM admins WHERE id = ?', Number(id));
    if (!a || a.status !== 'active') return res.status(401).json({ error: 'Please log in.' });
    req.admin = a;
    next();
  } catch (e) { next(e); }
}
export const requireSuper = (req, res, next) => (req.admin.role === 'super_admin' ? next() : res.status(403).json({ error: 'Super admin only.' }));

// ---------- passwords (scrypt, no extra dependency)
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [alg, s, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}
export const tempPassword = () => crypto.randomBytes(9).toString('base64url');

// ---------- forgiving name match (from Saturday Sprint): case, dots, spaces and word order do not matter,
// a word may be an initial, a long word may be one letter off, a middle name may be left out.
const nameWords = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function namesMatch(listed, typed) {
  const a = nameWords(listed), b = nameWords(typed);
  if (!a.length) return true; // listed without a name: any name
  if (!b.length) return false;
  if (a.join('') === b.join('') || [...a].sort().join(' ') === [...b].sort().join(' ')) return true;
  const close = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && editDistance(x, y) <= (Math.min(x.length, y.length) >= 8 ? 2 : 1));
  const left = [...a];
  let full = 0;
  for (const w of [...b].sort((x, y) => y.length - x.length)) {
    let i = left.findIndex((x) => close(x, w));
    if (i >= 0) full++;
    else if (w.length === 1) i = left.findIndex((x) => x[0] === w);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return full >= 1 && b.length >= Math.min(2, a.length);
}

// A student's first name: the first word of their listed name that is more than an initial ("K RAHUL" -> "rahul").
export const firstName = (name) => nameWords(name).find((w) => w.length > 1) || '';
// The typed name is just that first name (spelled exactly; case and accents don't matter).
export const isFirstNameOnly = (listed, typed) => { const b = nameWords(typed); return b.length === 1 && b[0].length > 1 && b[0] === firstName(listed); };

// Simple in-memory brake on wrong-name guesses per NIAT ID (per instance; enough to slow down guessing).
const fails = new Map();
export function tooManyFails(roll) {
  const f = fails.get(roll);
  return f && f.n >= 10 && Date.now() - f.t < 15 * 60e3;
}
export function addFail(roll) {
  const f = fails.get(roll);
  fails.set(roll, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() });
}
export const clearFails = (roll) => fails.delete(roll);
