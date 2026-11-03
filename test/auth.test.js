// Student sign-in: NIAT ID + name once, then Google or a password; recovery email; reset links; admin login reset.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_MEMORY = 'true';
process.env.ALLOW_TEST_LOGIN = 'false';
process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secret';
const { default: app } = await import('../server/app.js');
const { ready, run, close } = await import('../server/db.js');
const { hashPassword } = await import('../server/auth.js');
const { outbox } = await import('../server/mail.js');
const { hooks } = await import('../server/studentAuth.js');

let server, base;
const jar = {};
async function call(who, method, url, body) {
  const r = await fetch(base + url, { method, redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie: jar[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); const m = Object.fromEntries((jar[who] || '').split('; ').filter(Boolean).map((x) => x.split('='))); if (v) m[k] = v; else delete m[k]; jar[who] = Object.entries(m).map(([a, b]) => a + '=' + b).join('; '); }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, location: r.headers.get('location') };
}
const linkIn = (mail) => (mail.text.match(/https?:\/\/\S+/) || [])[0];
const claims = (sub, email) => ({ sub, email, email_verified: true, aud: 'cid.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600 });
async function google(who, mode, c) {
  hooks.exchange = async () => c;
  const s = await call(who, 'GET', '/api/auth/google/start?mode=' + mode);
  assert.equal(s.status, 302);
  const u = new URL(s.location);
  assert.equal(u.host, 'accounts.google.com');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  return call(who, 'GET', `/api/auth/google/callback?code=x&state=${u.searchParams.get('state')}`);
}

test.before(async () => {
  await ready();
  const now = Date.now();
  for (const [r, n, e] of [['N26P02A0001', 'Asha Kumari Rao', ''], ['N26P02A0002', 'Ravi Teja', 'ravi@gmail.com'], ['N26P02A0003', 'Meena Iyer', '']])
    await run("INSERT INTO students_master (roll_no, name, university, email, created_at, updated_at) VALUES (?, ?, 'ALARD - Pune', ?, ?, ?)", r, n, e, now, now);
  await run("INSERT INTO admins (email, name, role, password_hash, must_change_pw, created_at) VALUES ('boss@x.in', 'Boss', 'super_admin', ?, 0, ?)", hashPassword('correct horse battery'), now);
  server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await close(); });

test('name login works once; after a password is set only the password (or Google) works', async () => {
  const l = await call('a', 'POST', '/api/auth/login', { roll: 'N26P02A0001', name: 'Asha' });
  assert.equal(l.status, 200); assert.equal(l.body.setup, true);
  const b = await call('a', 'GET', '/api/boot');
  assert.equal(b.body.me.secured, false);
  assert.equal((await call('a', 'POST', '/api/account/password', { next: 'short' })).status, 400);
  assert.equal((await call('a', 'POST', '/api/account/password', { next: 'n26p02a0001' })).status, 400);
  const p = await call('a', 'POST', '/api/account/password', { next: 'tiger-lily-42' });
  assert.equal(p.status, 200); assert.equal(p.body.secured, true); assert.equal(p.body.hasPassword, true);
  // name login is now refused, password login works, a wrong password is refused
  const n = await call('x', 'POST', '/api/auth/login', { roll: 'N26P02A0001', name: 'Asha' });
  assert.equal(n.status, 409); assert.equal(n.body.code, 'secured');
  assert.equal((await call('x', 'POST', '/api/auth/login', { roll: 'N26P02A0001', password: 'nope-nope' })).status, 401);
  const ok = await call('x', 'POST', '/api/auth/login', { roll: 'N26P02A0001', password: 'tiger-lily-42' });
  assert.equal(ok.status, 200); assert.equal(ok.body.setup, false);
  // changing it needs the current one, and ends the other sessions
  assert.equal((await call('x', 'POST', '/api/account/password', { current: 'wrong', next: 'new-pass-123' })).status, 403);
  assert.equal((await call('x', 'POST', '/api/account/password', { current: 'tiger-lily-42', next: 'new-pass-123' })).status, 200);
  assert.equal((await call('a', 'GET', '/api/boot')).status, 401, 'the older session ended');
  assert.equal((await call('x', 'GET', '/api/boot')).status, 200, 'this session stays');
  // a student with no password trying a password gets told to use their name the first time
  const np = await call('y', 'POST', '/api/auth/login', { roll: 'N26P02A0003', password: 'whatever1' });
  assert.equal(np.status, 409); assert.equal(np.body.code, 'nopassword');
});

test('recovery email: verify link, then forgot password sends a single-use reset link', async () => {
  const r = await call('x', 'POST', '/api/account/recovery', { email: 'Asha.Rao@Example.com' });
  assert.equal(r.status, 200); assert.equal(r.body.sent, true); assert.deepEqual(r.body.recovery, { email: 'asha.rao@example.com', verified: false });
  // not verified yet: forgot sends nothing (same reply either way)
  const before = outbox.length;
  const f0 = await call('z', 'POST', '/api/auth/forgot', { roll: 'N26P02A0001' });
  assert.equal(f0.status, 200); assert.equal(outbox.length, before);
  const v = outbox.findLast((m) => m.to === 'asha.rao@example.com' && /Confirm/.test(m.subject));
  const vr = await call('x', 'GET', new URL(linkIn(v)).pathname + new URL(linkIn(v)).search);
  assert.equal(vr.status, 302); assert.equal(vr.location, '/?account=email-verified');
  assert.equal((await call('x', 'GET', '/api/account')).body.recovery.verified, true);
  // forgot -> link -> new password; old password and old sessions stop working
  const f = await call('z', 'POST', '/api/auth/forgot', { roll: 'N26P02A0001' });
  assert.equal(f.status, 200); assert.match(f.body.message, /reset link/);
  const m = outbox.at(-1); assert.equal(m.to, 'asha.rao@example.com');
  const token = new URL(linkIn(m)).searchParams.get('t');
  assert.equal((await call('z', 'POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
  const rs = await call('z', 'POST', '/api/auth/reset', { token, password: 'brand-new-99' });
  assert.equal(rs.status, 200);
  assert.equal((await call('z', 'GET', '/api/boot')).status, 200, 'reset signs you in');
  assert.equal((await call('x', 'GET', '/api/boot')).status, 401, 'other sessions ended');
  assert.equal((await call('z', 'POST', '/api/auth/reset', { token, password: 'again-again-1' })).status, 400, 'single use');
  assert.equal((await call('q', 'POST', '/api/auth/login', { roll: 'N26P02A0001', password: 'new-pass-123' })).status, 401);
  assert.equal((await call('q', 'POST', '/api/auth/login', { roll: 'N26P02A0001', password: 'brand-new-99' })).status, 200);
  // unknown NIAT ID gets the same reply
  assert.equal((await call('z', 'POST', '/api/auth/forgot', { roll: 'NOPE999' })).body.message, f.body.message);
});

test('Google: connect after a name login, sign in with it; master-list email works on day one; one account per NIAT ID', async () => {
  // unknown Google account
  const u = await google('g', 'login', claims('sub-unknown', 'who@gmail.com'));
  assert.equal(u.location, '/login.html?g=notlinked');
  // Meena logs in with her name, then connects Google
  await call('m', 'POST', '/api/auth/login', { roll: 'N26P02A0003', name: 'Meena Iyer' });
  const l = await google('m', 'link', claims('sub-meena', 'meena@gmail.com'));
  assert.equal(l.location, '/?account=google-linked');
  const acct = (await call('m', 'GET', '/api/account')).body;
  assert.equal(acct.secured, true); assert.equal(acct.google.email, 'meena@gmail.com');
  // a wrong audience is refused
  assert.equal((await google('g2', 'login', { ...claims('sub-meena', 'meena@gmail.com'), aud: 'other' })).location, '/login.html?g=failed');
  // sign in with Google from a fresh browser
  const s = await google('m2', 'login', claims('sub-meena', 'meena@gmail.com'));
  assert.equal(s.location, '/');
  assert.equal((await call('m2', 'GET', '/api/boot')).body.me.roll, 'N26P02A0003');
  // her name no longer works
  assert.equal((await call('m3', 'POST', '/api/auth/login', { roll: 'N26P02A0003', name: 'Meena Iyer' })).body.code, 'secured');
  // the same Google account can't be put on another NIAT ID
  await call('r0', 'POST', '/api/auth/login', { roll: 'N26P02A0002', name: 'Ravi Teja' });
  assert.equal((await google('r0', 'link', claims('sub-meena', 'meena@gmail.com'))).location, '/?account=google-taken');
  // Ravi's Google email is on the master list: day-one Google sign-in links it
  const rv = await google('r1', 'login', claims('sub-ravi', 'Ravi@gmail.com'));
  assert.equal(rv.location, '/');
  assert.equal((await call('r1', 'GET', '/api/boot')).body.me.roll, 'N26P02A0002');
  // unlinking needs a password; using the Google email as recovery is verified at once
  assert.equal((await call('m2', 'POST', '/api/account/google/unlink')).status, 409);
  const rec = await call('m2', 'POST', '/api/account/recovery', { useGoogle: true });
  assert.deepEqual(rec.body.recovery, { email: 'meena@gmail.com', verified: true });
  await call('m2', 'POST', '/api/account/password', { next: 'meena-pass-1' });
  const un = await call('m2', 'POST', '/api/account/google/unlink');
  assert.equal(un.status, 200); assert.equal(un.body.google, null); assert.equal(un.body.secured, true);
  // an old or forged state is refused
  assert.equal((await call('g', 'GET', '/api/auth/google/callback?code=x&state=forged')).location, '/login.html?g=expired');
});

test('admin login reset brings back the name login', async () => {
  await call('admin', 'POST', '/api/admin/login', { email: 'boss@x.in', password: 'correct horse battery' });
  const d = await call('admin', 'GET', '/api/admin/students/N26P02A0003');
  assert.equal(d.body.login.hasPassword, true);
  assert.equal((await call('admin', 'POST', '/api/admin/students/N26P02A0003/login-reset')).status, 200);
  assert.equal((await call('m2', 'GET', '/api/boot')).status, 401, 'signed out everywhere');
  const l = await call('m4', 'POST', '/api/auth/login', { roll: 'N26P02A0003', name: 'Meena' });
  assert.equal(l.status, 200); assert.equal(l.body.setup, true);
  assert.equal((await call('admin', 'GET', '/api/admin/students/N26P02A0003')).body.login.secured, false);
});
