// Student sign-in beyond NIAT ID + name:
//  - NIAT ID + name works only until the student is "secured" (has connected Google or set a password).
//  - "Continue with Google" (OAuth code flow with PKCE, plain fetch, no extra library). Any Google account can be
//    connected; a Google email that matches the master list signs in on day one.
//  - NIAT ID + password (scrypt, like admins), a recovery email the student verifies, and emailed reset links.
//  - Admins can reset a student's login, so they can use NIAT ID + name once more.
import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { one, all, run, tx, audit } from './db.js';
import { normRoll, universityOf } from './universities.js';
import * as stats from './analytics.js';
import { createSession, readCookie, sessionFor, STUDENT_COOKIE, requireStudent, namesMatch, isFirstNameOnly, tooManyFails, addFail, clearFails,
  hashPassword, checkPassword } from './auth.js';
import { sendMail, linkMail } from './mail.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const RESET_MS = 30 * 60e3, VERIFY_MS = 24 * 3600e3, G_COOKIE = 'kbc_g';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const googleOn = () => !!(config.googleClientId && config.googleClientSecret);
// Tests swap the Google token exchange for a stub: (code, verifier, redirectUri) => id_token claims.
export const hooks = { exchange: null };

const base = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;
export async function authOf(roll) {
  return one('SELECT roll_no, google_sub, google_email, password_hash, recovery_email, recovery_verified_at FROM student_auth WHERE roll_no = ?', roll);
}
export const isSecured = (a) => !!(a && (a.google_sub || a.password_hash));
export function accountView(a) {
  return {
    secured: isSecured(a), googleOn: googleOn(),
    google: a && a.google_sub ? { email: a.google_email || '' } : null,
    hasPassword: !!(a && a.password_hash),
    recovery: a && a.recovery_email ? { email: a.recovery_email, verified: !!a.recovery_verified_at } : null
  };
}
async function setAuth(roll, fields) {
  const now = Date.now(), keys = Object.keys(fields);
  await run('INSERT INTO student_auth (roll_no, updated_at) VALUES (?, ?) ON CONFLICT (roll_no) DO NOTHING', roll, now);
  await run(`UPDATE student_auth SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE roll_no = ?`, ...keys.map((k) => fields[k]), now, roll);
}
function passwordProblem(pw, roll) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (pw.trim().toUpperCase() === String(roll).toUpperCase()) return "Don't use your NIAT ID as your password.";
  return null;
}
// End this student's sessions, except the one making the request (when `keep` is that request).
async function endOtherSessions(roll, keep) {
  const t = keep && readCookie(keep, STUDENT_COOKIE);
  if (t) await run("DELETE FROM sessions WHERE kind = 'student' AND subject_id = ? AND token_hash <> ?", roll, sha(t));
  else await run("DELETE FROM sessions WHERE kind = 'student' AND subject_id = ?", roll);
}
async function signIn(res, st) {
  await run('UPDATE students_master SET last_login_at = ? WHERE roll_no = ?', Date.now(), st.roll_no);
  await stats.recordLogin(run, st.roll_no, st.university || universityOf(st.roll_no));
  await createSession(res, 'student', st.roll_no);
}
async function newToken(kind, roll, email, ms) {
  const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
  await run('INSERT INTO auth_tokens (token_hash, kind, roll_no, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', sha(token), kind, roll, email, now, now + ms);
  return token;
}
async function useToken(kind, token) {
  const r = await one('SELECT token_hash, roll_no, email, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND kind = ?', sha(String(token || '')), kind);
  if (!r || r.used_at || Number(r.expires_at) < Date.now()) return null;
  await run('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?', Date.now(), r.token_hash);
  return r;
}
const recentTokens = async (kind, roll, ms) => Number((await one('SELECT COUNT(*)::int AS n FROM auth_tokens WHERE kind = ? AND roll_no = ? AND created_at > ?', kind, roll, Date.now() - ms)).n);

async function sendVerify(req, roll, email) {
  const t = await newToken('verify_email', roll, email, VERIFY_MS);
  const url = `${base(req)}/api/auth/verify-email?t=${t}`;
  await sendMail({ to: email, subject: 'Confirm your recovery email · Kaun Banega Coder', ...linkMail({
    heading: 'Confirm your recovery email',
    lines: [`NIAT ID ${roll} wants to use this address to reset their Kaun Banega Coder password.`, 'Tap the button to confirm. The link works for 24 hours.'],
    button: 'Confirm email', url, footer: "Didn't ask for this? Ignore this email and nothing changes." }) });
}

// ---------- signed, short-lived cookie that carries the Google sign-in state across the redirect
const sign = (v) => crypto.createHmac('sha256', config.appSecret).update(v).digest('base64url');
const packG = (o) => { const v = b64u(JSON.stringify(o)); return `${v}.${sign(v)}`; };
function unpackG(s) {
  const [v, m] = String(s || '').split('.');
  if (!v || !m || m.length !== sign(v).length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(sign(v)))) return null;
  try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return Date.now() - o.at < 10 * 60e3 ? o : null; } catch { return null; }
}
async function exchange(code, verifier, redirectUri) {
  if (hooks.exchange) return hooks.exchange(code, verifier, redirectUri);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id_token) throw new Error('google token exchange failed: ' + (d.error || r.status));
  // the id_token came straight from Google over TLS, so its claims can be read without checking the signature
  return JSON.parse(Buffer.from(String(d.id_token).split('.')[1], 'base64url').toString());
}
function claimsOk(c) {
  return c && c.sub && c.aud === config.googleClientId && ['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) &&
    Number(c.exp) * 1000 > Date.now() && (c.email_verified === true || c.email_verified === 'true');
}

export function mountStudentAuth(app, admin, { firstNameUnique, testRules, wrap }) {
  const jsonBody = express.json({ limit: '64kb' });

  // what the login page can offer
  app.get('/api/auth/options', (req, res) => res.json({ google: googleOn() }));

  // ---------- NIAT ID + password, or NIAT ID + name until the student is secured
  app.post('/api/auth/login', jsonBody, wrap(async (req, res) => {
    const roll = normRoll(req.body?.roll), name = String(req.body?.name || '').trim().slice(0, 80), pw = req.body?.password;
    const withPw = typeof pw === 'string';
    if (!roll || (withPw ? !pw : !name)) return res.status(400).json({ error: withPw ? 'Enter your NIAT ID and your password.' : 'Enter your NIAT ID and your name.' });
    if (tooManyFails(roll)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes and try again.' });
    let st = await one('SELECT roll_no, name, university, active FROM students_master WHERE roll_no = ?', roll);
    const TR = config.allowTestLogin && !st && !withPw ? await testRules() : null;
    if (TR && TR.rollPrefixes.some((p) => roll.startsWith(p.toUpperCase()))) {
      // test logins (when enabled) are tagged with the first test university from Admin > Settings, so analytics leaves them out
      const now = Date.now();
      await run("INSERT INTO students_master (roll_no, name, university, source, created_at, updated_at) VALUES (?, ?, ?, 'test', ?, ?) ON CONFLICT (roll_no) DO NOTHING",
        roll, name, TR.universities[0] || 'Test', now, now);
      st = await one('SELECT roll_no, name, university, active FROM students_master WHERE roll_no = ?', roll);
    }
    if (!st) return res.status(404).json({ error: 'This NIAT ID is not on the list. Check it, or ask your mentor to add you.' });
    if (!st.active) return res.status(403).json({ error: 'This NIAT ID is not active. Ask your mentor.' });
    const a = await authOf(roll);
    if (withPw) {
      if (!a || !a.password_hash) {
        return res.status(409).json({ code: 'nopassword', error: a && a.google_sub
          ? 'This NIAT ID signs in with Google. Use Continue with Google, or set a password from Account after signing in.'
          : "You haven't set a password yet. First time here? Use your name instead." });
      }
      if (!checkPassword(String(pw), a.password_hash)) { addFail(roll); return res.status(401).json({ error: 'Wrong password. Try again, or use Forgot password.' }); }
    } else {
      if (isSecured(a)) {
        return res.status(409).json({ code: 'secured', error: a.password_hash
          ? "You've set up your account. Log in with your password, or Continue with Google."
          : "You've set up your account. Use Continue with Google." });
      }
      if (!namesMatch(st.name, name) && !(await firstNameUnique(st, name))) {
        addFail(roll);
        return res.status(401).json({ error: isFirstNameOnly(st.name, name)
          ? 'Another student at your university has the same first name. Type your full name.'
          : 'The name does not match our list for this NIAT ID. Type your full name.' });
      }
    }
    clearFails(roll);
    await signIn(res, st);
    res.json({ ok: true, setup: !isSecured(a) });
  }));

  // ---------- Google
  app.get('/api/auth/google/start', wrap(async (req, res) => {
    const mode = req.query.mode === 'link' ? 'link' : 'login';
    if (!googleOn()) return res.redirect(mode === 'link' ? '/?account=google-off' : '/login.html?g=off');
    if (mode === 'link' && !(await sessionFor(req, 'student'))) return res.redirect('/login.html');
    const state = crypto.randomBytes(16).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url');
    res.cookie(G_COOKIE, packG({ s: state, v: verifier, m: mode, at: Date.now() }), { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 10 * 60e3, path: '/api/auth/google' });
    const q = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: base(req) + '/api/auth/google/callback', response_type: 'code',
      scope: 'openid email profile', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  }));
  app.get('/api/auth/google/callback', wrap(async (req, res) => {
    const g = unpackG(readCookie(req, G_COOKIE));
    res.clearCookie(G_COOKIE, { path: '/api/auth/google' });
    const back = (mode, code) => res.redirect(mode === 'link' ? `/?account=${code}` : `/login.html?g=${code}`);
    if (!g || !req.query.state || req.query.state !== g.s) return back(g ? g.m : 'login', 'expired');
    if (req.query.error || !req.query.code) return back(g.m, 'cancelled');
    let c;
    try { c = await exchange(String(req.query.code), g.v, base(req) + '/api/auth/google/callback'); } catch (e) { console.error(e); return back(g.m, 'failed'); }
    if (!claimsOk(c)) return back(g.m, 'failed');
    const email = String(c.email || '').toLowerCase(), owner = await one('SELECT roll_no FROM student_auth WHERE google_sub = ?', c.sub);
    if (g.m === 'link') {
      const roll = await sessionFor(req, 'student');
      if (!roll) return res.redirect('/login.html');
      if (owner && owner.roll_no !== roll) return back('link', 'google-taken');
      await setAuth(roll, { google_sub: c.sub, google_email: email });
      return back('link', 'google-linked');
    }
    let roll = owner && owner.roll_no;
    if (!roll && email) {
      // day one: the Google email is this student's email on the master list (and only theirs)
      const m = await all("SELECT roll_no FROM students_master WHERE lower(email) = ? AND active = 1", email);
      if (m.length === 1) {
        const a = await authOf(m[0].roll_no);
        if (!a || !a.google_sub) { roll = m[0].roll_no; await setAuth(roll, { google_sub: c.sub, google_email: email }); }
      }
    }
    if (!roll) return back('login', 'notlinked');
    const st = await one('SELECT roll_no, university, active FROM students_master WHERE roll_no = ?', roll);
    if (!st || !st.active) return back('login', 'inactive');
    await signIn(res, st);
    res.redirect('/');
  }));

  // ---------- the student's own account settings
  app.get('/api/account', requireStudent, wrap(async (req, res) => { res.json(accountView(await authOf(req.student.roll_no))); }));
  app.post('/api/account/password', requireStudent, jsonBody, wrap(async (req, res) => {
    const roll = req.student.roll_no, a = await authOf(roll), next = String(req.body?.next || '');
    if (a && a.password_hash && !checkPassword(String(req.body?.current || ''), a.password_hash)) return res.status(403).json({ error: 'Your current password is not right.' });
    const bad = passwordProblem(next, roll);
    if (bad) return res.status(400).json({ error: bad });
    await setAuth(roll, { password_hash: hashPassword(next) });
    await endOtherSessions(roll, req);
    res.json(accountView(await authOf(roll)));
  }));
  app.post('/api/account/google/unlink', requireStudent, wrap(async (req, res) => {
    const roll = req.student.roll_no, a = await authOf(roll);
    if (!a || !a.password_hash) return res.status(409).json({ error: 'Set a password first, so you can still log in without Google.' });
    await setAuth(roll, { google_sub: null, google_email: null });
    res.json(accountView(await authOf(roll)));
  }));
  app.post('/api/account/recovery', requireStudent, jsonBody, wrap(async (req, res) => {
    const roll = req.student.roll_no, a = await authOf(roll);
    if (req.body?.useGoogle) {
      if (!a || !a.google_email) return res.status(409).json({ error: 'Connect a Google account first.' });
      await setAuth(roll, { recovery_email: a.google_email, recovery_verified_at: Date.now() });
      return res.json(accountView(await authOf(roll)));
    }
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (await recentTokens('verify_email', roll, 3600e3) >= 5) return res.status(429).json({ error: 'Too many emails sent. Try again in an hour.' });
    // the Google email is already checked by Google
    const same = a && a.google_email && a.google_email === email;
    await setAuth(roll, { recovery_email: email, recovery_verified_at: same ? Date.now() : null });
    if (!same) await sendVerify(req, roll, email);
    res.json({ ...accountView(await authOf(roll)), sent: !same });
  }));
  app.get('/api/auth/verify-email', wrap(async (req, res) => {
    const t = await useToken('verify_email', req.query.t);
    const a = t && await authOf(t.roll_no), ok = !!(a && a.recovery_email === t.email);
    if (ok) await setAuth(t.roll_no, { recovery_verified_at: Date.now() });
    const signedIn = !!(await sessionFor(req, 'student'));
    res.redirect(signedIn ? `/?account=${ok ? 'email-verified' : 'email-link-bad'}` : `/login.html?v=${ok ? 'ok' : 'bad'}`);
  }));

  // ---------- forgot password: a reset link to the verified recovery email
  const FORGOT = 'If this NIAT ID has a verified recovery email, we have sent a reset link to it. It works for 30 minutes. No email? Ask your mentor to reset your login.';
  app.post('/api/auth/forgot', jsonBody, wrap(async (req, res) => {
    const roll = normRoll(req.body?.roll);
    if (!roll) return res.status(400).json({ error: 'Enter your NIAT ID.' });
    const a = await authOf(roll), st = await one('SELECT active FROM students_master WHERE roll_no = ?', roll);
    if (st && st.active && a && a.recovery_email && a.recovery_verified_at && await recentTokens('reset', roll, 3600e3) < 3) {
      const t = await newToken('reset', roll, a.recovery_email, RESET_MS), url = `${base(req)}/reset.html?t=${t}`;
      await sendMail({ to: a.recovery_email, subject: 'Reset your password · Kaun Banega Coder', ...linkMail({
        heading: 'Reset your password', lines: [`Someone asked to reset the password for NIAT ID ${roll}.`, 'Tap the button to choose a new one. The link works for 30 minutes and only once.'],
        button: 'Choose a new password', url, footer: "Didn't ask for this? Ignore this email; your password stays the same." }) });
    }
    res.json({ ok: true, message: FORGOT });
  }));
  app.post('/api/auth/reset', jsonBody, wrap(async (req, res) => {
    const pw = String(req.body?.password || '');
    const peek = await one("SELECT roll_no FROM auth_tokens WHERE token_hash = ? AND kind = 'reset' AND used_at IS NULL AND expires_at > ?", sha(String(req.body?.token || '')), Date.now());
    if (!peek) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one from the login page.' });
    const bad = passwordProblem(pw, peek.roll_no);
    if (bad) return res.status(400).json({ error: bad });
    const t = await useToken('reset', req.body?.token);
    if (!t) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one from the login page.' });
    const st = await one('SELECT roll_no, university, active FROM students_master WHERE roll_no = ?', t.roll_no);
    if (!st || !st.active) return res.status(403).json({ error: 'This NIAT ID is not active. Ask your mentor.' });
    await setAuth(t.roll_no, { password_hash: hashPassword(pw) });
    await endOtherSessions(t.roll_no, null);
    clearFails(t.roll_no);
    await signIn(res, st);
    res.json({ ok: true });
  }));

  // ---------- admin: back to NIAT ID + name for a student who is locked out
  admin.post('/students/:roll/login-reset', wrap(async (req, res) => {
    const roll = normRoll(req.params.roll), m = await one('SELECT roll_no, university FROM students_master WHERE roll_no = ?', roll);
    if (!m || (req.admin.university && m.university !== req.admin.university)) return res.status(404).json({ error: 'Not found' });
    await tx(async () => {
      await run('DELETE FROM student_auth WHERE roll_no = ?', roll);
      await run('DELETE FROM auth_tokens WHERE roll_no = ?', roll);
      await run("DELETE FROM sessions WHERE kind = 'student' AND subject_id = ?", roll);
    });
    await audit(req.admin.id, 'student_login_reset', roll, null);
    res.json({ ok: true });
  }));
}
