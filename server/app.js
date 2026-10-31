// Kaun Banega Coder: the whole API as one Express app (one Vercel function, like Saturday Sprint).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ready, one, all, run, tx, json, dbKind, audit } from './db.js';
import { extractCtData, ctToGraph } from './ctgraph.js';
import { content, loadQuestion, questionById, uploadBank, uploadGraph, activateGraph, graphHistory, seedIfEmpty } from './bank.js';
import { newState, upgradeState, activeSkill, address, applyAnswer, view as engineView, ladderFor, VARIANTS } from './engine.js';
import { present, grade, fifty } from './grade.js';
import { universityOf, normRoll } from './universities.js';
import {
  createSession, endSession, requireStudent, requireAdmin, requireSuper, namesMatch, firstName, isFirstNameOnly, tooManyFails, addFail, clearFails,
  checkPassword, hashPassword, tempPassword
} from './auth.js';
import { parseStudents } from './students.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// First request on a fresh instance: tables, then the built-in content if the database is empty.
let booted = null;
const boot = () => (booted ||= ready().then(seedIfEmpty).catch((e) => { booted = null; throw e; }));
app.use('/api', (req, res, next) => { boot().then(() => next(), next); });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const jsonBody = express.json({ limit: '1mb' });
const bigJson = express.json({ limit: '25mb' });

// ---------- health
app.get('/api/health', wrap(async (req, res) => {
  const c = await content();
  res.json({ ok: true, db: dbKind(), questions: c.count, graph: c.version, skills: c.G.skills.length });
}));

// The active graph version, polled by an open game when its tab comes back into view.
app.get('/api/version', wrap(async (req, res) => { res.json({ graph: (await content()).version }); }));

// ---------- fresh start: every student's journey begins again (attempt history is kept)
// The time of the last fresh start is the "progress epoch". A game page opened before it can't save its old wallet back.
async function progressEpoch() {
  const r = await one("SELECT value FROM app_settings WHERE key = 'progress_epoch'");
  return r ? Number(r.value) : 0;
}
async function freshStart(adminId) {
  const now = Date.now();
  const n = await tx(async () => {
    const a = await one('SELECT COUNT(*)::int AS n FROM engine_state');
    await run('DELETE FROM engine_state');
    await run('DELETE FROM game_progress');
    await run("INSERT INTO app_settings (key, value) VALUES ('progress_epoch', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(now));
    return a.n;
  });
  await audit(adminId, 'fresh_start', null, { students: n, at: now });
  return { students: n, epoch: now };
}

// ---------- student auth
// The first name alone is enough when no other active student at the same university has that first name.
async function firstNameUnique(st, typed) {
  if (!isFirstNameOnly(st.name, typed)) return false;
  const uni = st.university || universityOf(st.roll_no);
  if (!uni) return false;
  const fn = firstName(st.name);
  const others = await all('SELECT roll_no, name FROM students_master WHERE university = ? AND active = 1 AND roll_no <> ?', uni, st.roll_no);
  return !others.some((o) => firstName(o.name) === fn);
}
app.post('/api/auth/login', jsonBody, wrap(async (req, res) => {
  const roll = normRoll(req.body?.roll), name = String(req.body?.name || '').trim().slice(0, 80);
  if (!roll || !name) return res.status(400).json({ error: 'Enter your NIAT ID and your name.' });
  if (tooManyFails(roll)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes and try again.' });
  let st = await one('SELECT roll_no, name, university, active FROM students_master WHERE roll_no = ?', roll);
  if (!st && config.allowTestLogin && roll.startsWith('TEST')) {
    const now = Date.now();
    await run("INSERT INTO students_master (roll_no, name, university, source, created_at, updated_at) VALUES (?, ?, 'Test', 'test', ?, ?) ON CONFLICT (roll_no) DO NOTHING", roll, name, now, now);
    st = await one('SELECT roll_no, name, university, active FROM students_master WHERE roll_no = ?', roll);
  }
  if (!st) return res.status(404).json({ error: 'This NIAT ID is not on the list. Check it, or ask your mentor to add you.' });
  if (!st.active) return res.status(403).json({ error: 'This NIAT ID is not active. Ask your mentor.' });
  if (!namesMatch(st.name, name) && !(await firstNameUnique(st, name))) {
    addFail(roll);
    return res.status(401).json({ error: isFirstNameOnly(st.name, name)
      ? 'Another student at your university has the same first name. Type your full name.'
      : 'The name does not match our list for this NIAT ID. Type your full name.' });
  }
  clearFails(roll);
  await run('UPDATE students_master SET last_login_at = ? WHERE roll_no = ?', Date.now(), roll);
  await createSession(res, 'student', roll);
  res.json({ ok: true });
}));
app.post('/api/auth/logout', wrap(async (req, res) => { await endSession(req, res, 'student'); res.json({ ok: true }); }));

// ---------- engine state helpers
async function loadState(roll, G, forUpdate = false) {
  const r = await one(`SELECT state, pending FROM engine_state WHERE roll_no = ?${forUpdate ? ' FOR UPDATE' : ''}`, roll);
  return r ? { st: upgradeState(G, r.state), pending: r.pending, exists: true } : { st: newState(G), pending: null, exists: false };
}
async function saveState(roll, st, pending) {
  await run(`INSERT INTO engine_state (roll_no, state, pending, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (roll_no) DO UPDATE SET state = excluded.state, pending = excluded.pending, updated_at = excluded.updated_at`,
  roll, json(st), json(pending), Date.now());
}
// Every engine view carries the graph version, so an open game can tell that the path changed and reload it.
const view = (c, st) => engineView(c.G, c.avail, st, c.version);
// One rung per skill group; clearing every group reaches the last rung (the finale).
const rungOf = (v) => { let r = 0; for (const d of v.groupsDone) { if (!d) break; r++; } return r >= v.groupsDone.length ? v.groupsDone.length + 1 : r; };
const sumLadder = (c, r) => ladderFor(c.G.groups.length).slice(0, r).reduce((a, b) => a + b, 0);

function graphForClient(c) {
  return {
    version: c.version,
    ladder: ladderFor(c.G.groups.length),
    checkpoints: c.graph.checkpoints,
    groups: c.graph.groups,
    skills: c.graph.skills.map((s) => ({ id: s.id, name: s.name, short: s.short || null, group: s.group, cp: s.cp, req: s.req || [], rmax: s.rmax,
      check: s.check || null, kps: s.kps || {}, mistakes: s.mistakes || {} })),
    types: c.typesDoc.types.map((t) => ({ key: t.key, level: t.level, T: t.T, name: t.name, description: t.description, ui: t.ui,
      grading: t.grading, modes: t.modes, lifeline_5050: t.lifeline_5050 })),
    levels: c.typesDoc.levels
  };
}

// Everything the game needs to start: who you are, the graph, your progress.
app.get('/api/boot', requireStudent, wrap(async (req, res) => {
  const c = await content();
  const { st } = await loadState(req.student.roll_no, c.G);
  const gp = await one('SELECT data FROM game_progress WHERE roll_no = ?', req.student.roll_no);
  // per-question ratings (ctx.kind "question") and end-of-game ratings don't count as the general feedback the reminders ask for
  const fb = (await all('SELECT ctx FROM feedback WHERE roll_no = ?', req.student.roll_no)).some((r) => { let c = r.ctx; if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } } return !c || !c.kind || c.kind === 'general'; });
  res.json({
    me: { roll: req.student.roll_no, name: req.student.name, university: req.student.university || universityOf(req.student.roll_no), feedbackGiven: !!fb },
    graph: graphForClient(c), engine: view(c, st), progress: gp ? gp.data : null, epoch: await progressEpoch()
  });
}));

// Serve the question at the student's address. An unanswered question is served again (a refresh does not skip it).
async function serveNext(roll, mode, { force = false } = {}) {
  const c = await content();
  return tx(async () => {
    const { st, pending } = await loadState(roll, c.G, true);
    const stale = pending && c.G.idx[pending.skill] == null; // its skill left the graph: serve afresh
    if (!force && !stale && pending && pending.mode === mode && Date.now() - pending.servedAt < 6 * 3600e3) {
      return { question: pending.client, address: pending.address, engine: view(c, st), resumed: true };
    }
    const { pending: p, body } = await pickNext(c, st, mode);
    await saveState(roll, st, p);
    return body;
  });
}
// The question at the student's address for this mode, as the pending question to store and the response to send.
async function pickNext(c, st, mode) {
  const act = activeSkill(c.G, c.avail, st);
  if (!act.id) return { pending: null, body: { question: null, engine: view(c, st), allDone: !!act.allDone, comingSoon: act.comingSoon || null } };
  const addr = address(c.G, c.avail, st, act.id, mode);
  const q = addr && await loadQuestion(addr.skill, addr.level, addr.type, addr.difficulty, addr.variant);
  if (!q) return { pending: null, body: { question: null, engine: view(c, st), comingSoon: [act.id] } };
  const { client, key } = present(q);
  const p = { qid: q.id, skill: addr.skill, type: addr.type, level: addr.level, r: addr.r, variant: addr.variant, mode, key, client, address: addr, servedAt: Date.now(), lifelines: [] };
  return { pending: p, body: { question: client, address: addr, engine: view(c, st) } };
}

app.get('/api/play/next', requireStudent, wrap(async (req, res) => {
  const mode = req.query.mode === 'practice' ? 'practice' : 'hotseat';
  res.json(await serveNext(req.student.roll_no, mode));
}));

app.post('/api/play/answer', requireStudent, jsonBody, wrap(async (req, res) => {
  const roll = req.student.roll_no, c = await content();
  const { qid, answer, ms, timeout, prefetch } = req.body || {};
  const out = await tx(async () => {
    const { st, pending } = await loadState(roll, c.G, true);
    if (!pending || pending.qid !== qid) return { status: 409, body: { error: 'This question is no longer open. Loading the next one.' } };
    const q = await questionById(qid);
    if (!q) return { status: 409, body: { error: 'Question not found.' } };
    const g = grade(q, answer, pending.key);
    if (timeout) { g.correct = false; g.why = q.ok || g.why; }
    const before = view(c, st);
    const { transitions, msg } = applyAnswer(c.G, st, pending.skill, pending.type, g.correct);
    // prefetch: the next question is chosen now and sent with the result, so "Next" needs no second round trip
    const next = prefetch ? await pickNext(c, st, pending.mode) : null;
    await saveState(roll, st, next ? next.pending : null);
    const now = Date.now();
    await run(`INSERT INTO attempts (roll_no, university, question_id, skill, level, type, r, variant, mode, correct, timeout, answer, ms, lifelines, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    roll, req.student.university || universityOf(roll), qid, pending.skill, pending.level, pending.type, pending.r, pending.variant, pending.mode,
    g.correct ? 1 : 0, timeout ? 1 : 0, json(answer ?? null), Math.max(0, Math.min(Number(ms) || 0, 3600e3)), json(pending.lifelines), now);
    for (const t of transitions) await run('INSERT INTO transitions (roll_no, skill, kind, detail, at) VALUES (?, ?, ?, ?, ?)', roll, t.skill || pending.skill, t.kind, json(t.detail), now);
    const after = view(c, st);
    return { status: 200, body: { correct: g.correct, show: g.show, why: g.why, ok: q.ok || '', detail: g.detail || null, msg, transitions,
      rungBefore: rungOf(before), rungAfter: rungOf(after), engine: after, next: next ? { ...next.body, mode: pending.mode } : undefined } };
  });
  res.status(out.status).json(out.body);
}));

app.post('/api/play/lifeline', requireStudent, jsonBody, wrap(async (req, res) => {
  const roll = req.student.roll_no, c = await content(), { qid, kind } = req.body || {};
  if (kind === 'flip') {
    // Flip: a fresh variant of the same type at the same address, no penalty.
    const ok = await tx(async () => {
      const { st, pending } = await loadState(roll, c.G, true);
      if (!pending || pending.qid !== qid || pending.lifelines.includes('flip')) return false;
      const sk = st.skills[pending.skill], vk = sk.level + '-' + pending.type + '-' + sk.r;
      sk.vars[vk] = Math.min(VARIANTS, (sk.vars[vk] || 0) + 1);
      await saveState(roll, st, null);
      return pending.mode;
    });
    if (!ok) return res.status(409).json({ error: 'Flip is not available now.' });
    const next = await serveNext(roll, ok, { force: true });
    if (next.question) await tx(async () => {
      const r = await one('SELECT pending FROM engine_state WHERE roll_no = ? FOR UPDATE', roll);
      if (r && r.pending) { r.pending.lifelines = ['flip']; await run('UPDATE engine_state SET pending = ? WHERE roll_no = ?', json(r.pending), roll); }
    });
    return res.json(next);
  }
  const out = await tx(async () => {
    const r = await one('SELECT pending FROM engine_state WHERE roll_no = ? FOR UPDATE', roll);
    const p = r && r.pending;
    if (!p || p.qid !== qid) return null;
    const q = await questionById(qid);
    let body;
    if (kind === 'fifty') body = { hide: fifty(q, p.key) };
    else if (kind === 'hint') {
      const S = c.graph.skills.find((s) => s.id === q.skill) || {};
      const fromMistakes = (q.mistakes || []).map((m) => S.mistakes && S.mistakes[m]).filter(Boolean);
      const fromKps = (q.kps || []).map((k) => S.kps && S.kps[k]).filter(Boolean);
      body = { hint: q.hint || fromMistakes[0] || fromKps[0] || 'Read the code one line at a time and say each value out loud.' };
    } else return null;
    if (!p.lifelines.includes(kind)) p.lifelines.push(kind);
    await run('UPDATE engine_state SET pending = ? WHERE roll_no = ?', json(p), roll);
    return body;
  });
  if (!out) return res.status(409).json({ error: 'That lifeline is not available now.' });
  res.json(out);
}));

// ---------- game progress (wallet, streaks, buddy …), events, Hall of Fame, feedback
app.get('/api/progress', requireStudent, wrap(async (req, res) => {
  const gp = await one('SELECT data FROM game_progress WHERE roll_no = ?', req.student.roll_no);
  res.json({ progress: gp ? gp.data : null });
}));
app.put('/api/progress', requireStudent, express.json({ limit: '256kb' }), wrap(async (req, res) => {
  const d = req.body?.progress;
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'progress missing' });
  delete d.seen; // the server keeps question history; the old client map is not needed
  // a page opened before the last fresh start must not bring the old wallet back
  if (Number(req.body?.epoch || 0) < await progressEpoch()) return res.status(409).json({ error: 'Your journey was restarted. Reloading.', reset: true });
  // Coins and best rung can only come from rungs the engine says were reached.
  const c = await content(), { st } = await loadState(req.student.roll_no, c.G);
  const rung = rungOf(view(c, st));
  const coins = Math.max(0, Math.min(Number(d.coins) || 0, sumLadder(c, rung))), best = Math.max(0, Math.min(Number(d.best) || 0, rung));
  await run(`INSERT INTO game_progress (roll_no, data, coins, best, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (roll_no) DO UPDATE SET data = excluded.data, coins = excluded.coins, best = excluded.best, updated_at = excluded.updated_at`,
  req.student.roll_no, json(d), coins, best, Date.now());
  res.json({ ok: true });
}));
app.post('/api/events', requireStudent, express.json({ limit: '256kb' }), wrap(async (req, res) => {
  const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 100) : [];
  await tx(async () => {
    for (const e of list) {
      if (!e || typeof e.kind !== 'string') continue;
      const { kind, t, ...rest } = e;
      await run('INSERT INTO events (roll_no, kind, data, at) VALUES (?, ?, ?, ?)', req.student.roll_no, kind.slice(0, 40), json(rest), Number(t) || Date.now());
    }
  });
  res.json({ ok: true, n: list.length });
}));
// Live players: a game page pings every 30 s; anyone seen in the last 75 s counts.
const LIVE_MS = 75_000;
let liveCache = { at: 0, n: 0 };
async function liveCount() {
  if (Date.now() - liveCache.at < 5000) return liveCache.n;
  const r = await one('SELECT COUNT(*)::int AS n FROM presence WHERE last_seen > ?', Date.now() - LIVE_MS);
  liveCache = { at: Date.now(), n: r.n };
  return r.n;
}
app.post('/api/live', requireStudent, wrap(async (req, res) => {
  const was = await one('SELECT last_seen FROM presence WHERE roll_no = ?', req.student.roll_no);
  await run('INSERT INTO presence (roll_no, last_seen) VALUES (?, ?) ON CONFLICT (roll_no) DO UPDATE SET last_seen = excluded.last_seen', req.student.roll_no, Date.now());
  if (!was || was.last_seen <= Date.now() - LIVE_MS) liveCache.at = 0; // a newly live player shows up at once
  res.json({ live: await liveCount() });
}));

// Hall of Fame. scope=all ranks every university; scope=uni ranks one (the student's own unless ?uni= names another).
// Coins and best rung are capped by the engine when saved (PUT /api/progress), so the ranking rests on server-checked numbers.
const FAME_SQL = `SELECT m.roll_no, m.name, m.university, g.coins, g.best, g.data, g.updated_at FROM game_progress g
  JOIN students_master m ON m.roll_no = g.roll_no WHERE m.active = 1 AND COALESCE((g.data->>'answered')::int, 0) > 0`;
const FAME_ORDER = ' ORDER BY g.coins DESC, g.best DESC, g.updated_at ASC';
const fameRow = (r, me) => ({ name: String(r.name || r.roll_no).slice(0, 40), university: r.university || '', coins: Number(r.coins) || 0, best: Number(r.best) || 0,
  correct: Number(r.data?.correct) || 0, answered: Number(r.data?.answered) || 0, me: r.roll_no === me });
app.get('/api/fame', requireStudent, wrap(async (req, res) => {
  const me = req.student.roll_no, own = req.student.university || universityOf(me);
  const scope = req.query.scope === 'uni' ? 'uni' : 'all', uni = scope === 'uni' ? String(req.query.uni || own || '') : '';
  const rows = uni ? await all(FAME_SQL + ' AND m.university = ?' + FAME_ORDER + ' LIMIT 50', uni) : await all(FAME_SQL + FAME_ORDER + ' LIMIT 50');
  const out = rows.map((r, i) => ({ ...fameRow(r, me), rank: i + 1 }));
  let mine = null;
  if (!out.some((r) => r.me)) {
    const r = await one(FAME_SQL + ' AND m.roll_no = ?', me);
    if (r && (!uni || r.university === uni)) {
      const ahead = await one(`SELECT COUNT(*)::int AS n FROM (${FAME_SQL}${uni ? ' AND m.university = ?' : ''}) t WHERE t.coins > ? OR (t.coins = ? AND t.best > ?)`,
        ...(uni ? [uni] : []), r.coins, r.coins, r.best);
      mine = { ...fameRow(r, me), rank: ahead.n + 1 };
    }
  }
  const universities = (await all("SELECT DISTINCT university FROM students_master WHERE active = 1 AND university IS NOT NULL AND university <> '' ORDER BY university")).map((r) => r.university);
  res.json({ scope, university: uni || own, universities, rows: out, me: mine, live: await liveCount() });
}));
app.post('/api/feedback', requireStudent, jsonBody, wrap(async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 4000), stars = Number(req.body?.ctx?.stars) || 0;
  // a star rating on its own is valid feedback (quick tags and text are optional)
  if (!text && !(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Pick a rating or write something first.' });
  await run('INSERT INTO feedback (roll_no, text, ctx, at) VALUES (?, ?, ?, ?)', req.student.roll_no, text, json(req.body?.ctx || null), Date.now());
  res.json({ ok: true });
}));

// ================= Admin =================
app.post('/api/admin/login', jsonBody, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), pw = String(req.body?.password || '');
  const a = await one('SELECT * FROM admins WHERE email = ?', email);
  if (!a || a.status !== 'active') return res.status(401).json({ error: 'Wrong email or password.' });
  if (a.locked_until && a.locked_until > Date.now()) return res.status(429).json({ error: 'Too many wrong tries. Try again in 15 minutes.' });
  if (!checkPassword(pw, a.password_hash)) {
    const n = a.failed_logins + 1;
    await run('UPDATE admins SET failed_logins = ?, locked_until = ? WHERE id = ?', n >= 8 ? 0 : n, n >= 8 ? Date.now() + 15 * 60e3 : null, a.id);
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  await run('UPDATE admins SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', Date.now(), a.id);
  await createSession(res, 'admin', a.id);
  res.json({ ok: true, mustChange: !!a.must_change_pw });
}));
app.post('/api/admin/logout', wrap(async (req, res) => { await endSession(req, res, 'admin'); res.json({ ok: true }); }));

const admin = express.Router();
admin.use(requireAdmin);
app.use('/api/admin', admin);
// University filter: a university-scoped admin always sees only their own.
const scope = (req) => req.admin.university || (req.query.university ? String(req.query.university) : null);

admin.get('/me', (req, res) => res.json({ admin: req.admin }));
admin.post('/password', jsonBody, wrap(async (req, res) => {
  const a = await one('SELECT password_hash FROM admins WHERE id = ?', req.admin.id);
  if (!checkPassword(String(req.body?.current || ''), a.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  const pw = String(req.body?.next || '');
  if (pw.length < 10) return res.status(400).json({ error: 'Use at least 10 characters.' });
  await run('UPDATE admins SET password_hash = ?, must_change_pw = 0 WHERE id = ?', hashPassword(pw), req.admin.id);
  res.json({ ok: true });
}));

admin.get('/universities', wrap(async (req, res) => {
  const rows = await all(`SELECT m.university, COUNT(*)::int AS students, SUM(CASE WHEN m.active = 1 THEN 1 ELSE 0 END)::int AS active,
      COUNT(m.last_login_at)::int AS logged_in
    FROM students_master m ${req.admin.university ? 'WHERE m.university = ?' : ''} GROUP BY m.university ORDER BY m.university`,
  ...(req.admin.university ? [req.admin.university] : []));
  res.json({ rows });
}));

admin.get('/students', wrap(async (req, res) => {
  const uni = scope(req), q = String(req.query.q || '').trim().toUpperCase(), limit = Math.min(Number(req.query.limit) || 200, 2000);
  const where = [], args = [];
  if (uni) { where.push('m.university = ?'); args.push(uni); }
  if (q) { where.push('(m.roll_no LIKE ? OR UPPER(m.name) LIKE ?)'); args.push('%' + q + '%', '%' + q + '%'); }
  const rows = await all(`SELECT m.roll_no, m.name, m.university, m.batch, m.active, m.last_login_at,
      (SELECT COUNT(*)::int FROM attempts a WHERE a.roll_no = m.roll_no) AS attempts,
      (SELECT SUM(a.correct)::int FROM attempts a WHERE a.roll_no = m.roll_no) AS correct,
      (SELECT MAX(a.at) FROM attempts a WHERE a.roll_no = m.roll_no) AS last_attempt,
      g.coins, g.best
    FROM students_master m LEFT JOIN game_progress g ON g.roll_no = m.roll_no
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.university, m.roll_no LIMIT ${limit}`, ...args);
  res.json({ rows });
}));

admin.get('/students/:roll', wrap(async (req, res) => {
  const roll = normRoll(req.params.roll), c = await content();
  const m = await one('SELECT * FROM students_master WHERE roll_no = ?', roll);
  if (!m || (req.admin.university && m.university !== req.admin.university)) return res.status(404).json({ error: 'Not found' });
  const { st, pending } = await loadState(roll, c.G);
  const attempts = await all('SELECT question_id, skill, level, type, r, variant, mode, correct, timeout, ms, lifelines, at FROM attempts WHERE roll_no = ? ORDER BY at DESC LIMIT 500', roll);
  const transitions = await all('SELECT skill, kind, detail, at FROM transitions WHERE roll_no = ? ORDER BY at DESC LIMIT 500', roll);
  const gp = await one('SELECT data, coins, best FROM game_progress WHERE roll_no = ?', roll);
  res.json({ student: m, engine: view(c, st), pending: pending ? { qid: pending.qid, mode: pending.mode, servedAt: pending.servedAt } : null,
    attempts, transitions, progress: gp });
}));

admin.post('/students/:roll/reset', requireSuper, wrap(async (req, res) => {
  const roll = normRoll(req.params.roll);
  await tx(async () => {
    await run('DELETE FROM engine_state WHERE roll_no = ?', roll);
    await run('DELETE FROM game_progress WHERE roll_no = ?', roll);
  });
  await audit(req.admin.id, 'student_reset', roll, null);
  res.json({ ok: true });
}));

admin.post('/students', requireSuper, jsonBody, wrap(async (req, res) => {
  const roll = normRoll(req.body?.roll), name = String(req.body?.name || '').trim();
  if (!roll || !name) return res.status(400).json({ error: 'NIAT ID and name are required.' });
  const uni = String(req.body?.university || '').trim() || universityOf(roll), now = Date.now();
  await run(`INSERT INTO students_master (roll_no, name, university, batch, email, active, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'admin', ?, ?)
    ON CONFLICT (roll_no) DO UPDATE SET name = excluded.name, university = excluded.university, batch = excluded.batch, email = excluded.email, active = 1, updated_at = excluded.updated_at`,
  roll, name, uni, String(req.body?.batch || ''), String(req.body?.email || ''), now, now);
  await audit(req.admin.id, 'student_add', roll, { name, uni });
  res.json({ ok: true });
}));
admin.post('/students/:roll/active', requireSuper, jsonBody, wrap(async (req, res) => {
  await run('UPDATE students_master SET active = ?, updated_at = ? WHERE roll_no = ?', req.body?.active ? 1 : 0, Date.now(), normRoll(req.params.roll));
  res.json({ ok: true });
}));

// Master list upload: .xlsx or .csv. mode=merge adds/updates; mode=sync also deactivates students missing from the file
// (only within the universities present in the file, so one campus's sheet never switches off another campus).
admin.post('/students/import', requireSuper, express.raw({ type: () => true, limit: '20mb' }), wrap(async (req, res) => {
  const { rows, errors } = await parseStudents(req.body, String(req.query.name || ''));
  if (!rows.length) return res.status(400).json({ error: 'No students found in the file.', errors });
  const mode = req.query.mode === 'sync' ? 'sync' : 'merge', now = Date.now();
  let added = 0, updated = 0, deactivated = 0;
  await tx(async () => {
    for (const s of rows) {
      const prev = await one('SELECT roll_no FROM students_master WHERE roll_no = ?', s.roll);
      await run(`INSERT INTO students_master (roll_no, name, university, batch, email, phone, active, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'file', ?, ?)
        ON CONFLICT (roll_no) DO UPDATE SET name = excluded.name, university = excluded.university, batch = excluded.batch, email = excluded.email,
          phone = excluded.phone, active = 1, updated_at = excluded.updated_at`,
      s.roll, s.name, s.university || universityOf(s.roll), s.batch, s.email, s.phone, now, now);
      if (prev) updated++; else added++;
    }
    if (mode === 'sync') {
      const unis = [...new Set(rows.map((s) => s.university || universityOf(s.roll)).filter(Boolean))];
      for (const u of unis) {
        const r = await all("UPDATE students_master SET active = 0, updated_at = ? WHERE university = ? AND active = 1 AND source = 'file' AND updated_at < ? RETURNING roll_no", now, u, now);
        deactivated += r.length;
      }
    }
    await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
      req.admin.id, String(req.query.name || ''), 'students', json({ rows: rows.length, added, updated, deactivated, mode }), json(errors.slice(0, 200)), now);
  });
  await audit(req.admin.id, 'students_import', String(req.query.name || ''), { added, updated, deactivated, mode });
  res.json({ ok: true, added, updated, deactivated, errors });
}));

// ---------- content
admin.post('/bank/upload', requireSuper, bigJson, wrap(async (req, res) => {
  const r = await uploadBank(req.body, { adminId: req.admin.id, fileName: String(req.query.name || ''), dryRun: req.query.dry === '1' });
  if (req.query.dry !== '1') await audit(req.admin.id, 'bank_upload', String(req.query.name || ''), r.counts);
  res.json(r);
}));
// The graph comes as skill-graph JSON, or as a CT Skill Graph HTML export ({ html }), converted in server/ctgraph.js.
// ?fresh=1 also starts every student from the beginning once the new graph is live.
admin.post('/graph/upload', requireSuper, bigJson, wrap(async (req, res) => {
  const dryRun = req.query.dry === '1';
  let graph = req.body, version = null, converted = null;
  if (typeof req.body?.html === 'string') {
    try {
      const live = await one('SELECT data FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
      graph = ctToGraph(extractCtData(req.body.html), live && live.data);
    } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
    version = graph.version + '-' + new Date().toISOString().slice(11, 16).replace(':', '');
    converted = { skills: graph.skills.length, groups: graph.groups.length, checkpoints: graph.checkpoints.length,
      starters: graph.skills.filter((s) => s.starter).map((s) => s.id) };
  }
  const r = await uploadGraph(graph, { adminId: req.admin.id, fileName: String(req.query.name || ''), dryRun, version });
  r.converted = converted;
  if (r.ok && !dryRun) {
    await audit(req.admin.id, 'graph_upload', r.version, r.diff);
    if (req.query.fresh === '1') r.fresh = await freshStart(req.admin.id);
  }
  res.status(r.ok ? 200 : 400).json(r);
}));
admin.post('/progress/reset', requireSuper, jsonBody, wrap(async (req, res) => {
  if (req.body?.confirm !== 'RESET') return res.status(400).json({ error: 'Type RESET to confirm.' });
  res.json({ ok: true, ...(await freshStart(req.admin.id)) });
}));
admin.get('/graph/history', wrap(async (req, res) => { res.json({ rows: await graphHistory() }); }));
admin.post('/graph/activate', requireSuper, jsonBody, wrap(async (req, res) => {
  const r = await activateGraph(String(req.body?.version || ''), { adminId: req.admin.id });
  if (r.ok) await audit(req.admin.id, 'graph_activate', r.version, r.diff);
  res.status(r.ok ? 200 : 404).json(r);
}));
admin.get('/content', wrap(async (req, res) => {
  const c = await content();
  const counts = await all("SELECT skill, level, type, COUNT(*)::int AS n FROM questions WHERE status = 'live' GROUP BY skill, level, type ORDER BY skill, level, type");
  const uploads = await all('SELECT id, file_name, kind, counts, at FROM bank_uploads ORDER BY at DESC LIMIT 30');
  res.json({ graph: graphForClient(c), counts, uploads, total: c.count });
}));
admin.get('/questions', wrap(async (req, res) => {
  const where = [], args = [];
  for (const k of ['skill', 'type', 'status']) if (req.query[k]) { where.push(`${k} = ?`); args.push(String(req.query[k])); }
  if (req.query.level) { where.push('level = ?'); args.push(Number(req.query.level)); }
  const rows = await all(`SELECT id, skill, level, type, difficulty, variant, status, data->>'task' AS task FROM questions
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY skill, level, type, difficulty, variant LIMIT 1000`, ...args);
  res.json({ rows });
}));
admin.get('/questions/:id', wrap(async (req, res) => {
  const q = await questionById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const st = await one('SELECT status FROM questions WHERE id = ?', req.params.id);
  const stats = await one('SELECT COUNT(*)::int AS n, SUM(correct)::int AS right FROM attempts WHERE question_id = ?', req.params.id);
  res.json({ question: q, status: st.status, preview: present(q).client, stats });
}));
admin.post('/questions/:id/status', requireSuper, jsonBody, wrap(async (req, res) => {
  const s = String(req.body?.status || '');
  if (!['live', 'draft', 'archived'].includes(s)) return res.status(400).json({ error: 'status must be live, draft or archived' });
  await run('UPDATE questions SET status = ?, updated_at = ? WHERE id = ?', s, Date.now(), req.params.id);
  (await import('./bank.js')).invalidate();
  await audit(req.admin.id, 'question_status', req.params.id, { status: s });
  res.json({ ok: true });
}));

// ---------- analytics (per university)
admin.get('/analytics', wrap(async (req, res) => {
  const uni = scope(req), c = await content();
  const f = uni ? 'WHERE university = ?' : '', a = uni ? [uni] : [];
  const totals = await one(`SELECT COUNT(*)::int AS attempts, COALESCE(SUM(correct),0)::int AS correct, COUNT(DISTINCT roll_no)::int AS players FROM attempts ${f}`, ...a);
  const students = await one(`SELECT COUNT(*)::int AS n, COUNT(last_login_at)::int AS logged_in FROM students_master WHERE active = 1 ${uni ? 'AND university = ?' : ''}`, ...a);
  const byType = await all(`SELECT level, type, COUNT(*)::int AS n, SUM(correct)::int AS right FROM attempts ${f} GROUP BY level, type ORDER BY level, type`, ...a);
  const byDay = await all(`SELECT TO_CHAR(TO_TIMESTAMP(at / 1000) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n, COUNT(DISTINCT roll_no)::int AS players
    FROM attempts ${f} ${uni ? 'AND' : 'WHERE'} at > ? GROUP BY day ORDER BY day`, ...a, Date.now() - 30 * 864e5);
  const byUni = req.admin.university ? [] : await all(`SELECT university, COUNT(*)::int AS n, SUM(correct)::int AS right, COUNT(DISTINCT roll_no)::int AS players
    FROM attempts GROUP BY university ORDER BY n DESC`);
  // skill completion from engine states of this university's students
  const states = await all(`SELECT e.state FROM engine_state e JOIN students_master m ON m.roll_no = e.roll_no ${uni ? 'WHERE m.university = ?' : ''}`, ...a);
  const skills = c.G.skills.map((S) => {
    let open = 0, done = 0, levels = [0, 0, 0, 0];
    for (const { state } of states) {
      const sk = state.skills && state.skills[S.id];
      if (!sk) continue;
      if (sk.status === 'done') done++;
      else if (sk.status === 'open') { open++; levels[sk.level - 1]++; }
    }
    return { id: S.id, name: S.name, group: S.group, open, done, levels };
  });
  res.json({ university: uni, totals, students, byType, byDay, byUni, skills });
}));

// ---------- CSV exports
const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((k) => {
  const v = r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k]);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}).join(','))].join('\n');
admin.get('/export/attempts.csv', wrap(async (req, res) => {
  const uni = scope(req);
  const rows = await all(`SELECT a.roll_no, m.name, a.university, a.question_id, a.skill, a.level, a.type, a.r, a.variant, a.mode, a.correct, a.timeout, a.ms, a.lifelines,
      TO_CHAR(TO_TIMESTAMP(a.at / 1000) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS') AS at_ist
    FROM attempts a LEFT JOIN students_master m ON m.roll_no = a.roll_no ${uni ? 'WHERE a.university = ?' : ''} ORDER BY a.at LIMIT 200000`, ...(uni ? [uni] : []));
  res.type('text/csv').attachment('kbc-attempts.csv').send(csv(rows, ['roll_no', 'name', 'university', 'question_id', 'skill', 'level', 'type', 'r', 'variant', 'mode', 'correct', 'timeout', 'ms', 'lifelines', 'at_ist']));
}));
admin.get('/export/students.csv', wrap(async (req, res) => {
  const uni = scope(req), c = await content();
  const rows = await all(`SELECT m.roll_no, m.name, m.university, m.batch, m.active, e.state, g.coins, g.best,
      (SELECT COUNT(*)::int FROM attempts a WHERE a.roll_no = m.roll_no) AS attempts,
      (SELECT SUM(a.correct)::int FROM attempts a WHERE a.roll_no = m.roll_no) AS correct
    FROM students_master m LEFT JOIN engine_state e ON e.roll_no = m.roll_no LEFT JOIN game_progress g ON g.roll_no = m.roll_no
    ${uni ? 'WHERE m.university = ?' : ''} ORDER BY m.university, m.roll_no`, ...(uni ? [uni] : []));
  for (const r of rows) {
    const s = r.state && r.state.skills ? r.state.skills : {};
    r.skills_done = Object.values(s).filter((x) => x.status === 'done').length;
    const act = r.state ? activeSkill(c.G, c.avail, upgradeState(c.G, r.state)).id : null;
    r.current = act ? `${act} L${s[act].level} R${s[act].r}` : '';
    delete r.state;
  }
  res.type('text/csv').attachment('kbc-students.csv').send(csv(rows, ['roll_no', 'name', 'university', 'batch', 'active', 'attempts', 'correct', 'skills_done', 'current', 'coins', 'best']));
}));

// ---------- admins and feedback
admin.get('/admins', requireSuper, wrap(async (req, res) => {
  res.json({ rows: await all('SELECT id, email, name, role, university, status, last_login_at FROM admins ORDER BY id') });
}));
admin.post('/admins', requireSuper, jsonBody, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email is required.' });
  const role = req.body?.role === 'super_admin' ? 'super_admin' : 'admin', uni = String(req.body?.university || '').trim() || null;
  const pw = tempPassword();
  await run(`INSERT INTO admins (email, name, role, university, password_hash, must_change_pw, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, university = excluded.university, password_hash = excluded.password_hash, must_change_pw = 1, status = 'active'`,
  email, String(req.body?.name || ''), role, uni, hashPassword(pw), Date.now());
  await audit(req.admin.id, 'admin_upsert', email, { role, uni });
  res.json({ ok: true, email, tempPassword: pw });
}));
admin.get('/feedback', wrap(async (req, res) => {
  const uni = scope(req);
  res.json({ rows: await all(`SELECT f.id, f.roll_no, m.name, m.university, f.text, f.ctx, f.at FROM feedback f LEFT JOIN students_master m ON m.roll_no = f.roll_no
    ${uni ? 'WHERE m.university = ?' : ''} ORDER BY f.at DESC LIMIT 500`, ...(uni ? [uni] : [])) });
}));

// ---------- pages (local dev; on Vercel the static files and rewrites in vercel.json serve them)
if (!config.isVercel) {
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[api]', req.method, req.url, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

export default app;
