// Student analytics for the admin console (the KBC counterpart of Saturday Sprint's analytics).
// Everything is computed from what the portal records: logins (student_logins), time with the game open
// (activity, from the 30-second "live" ping while the tab is visible), answers (attempts), engine steps (transitions),
// game events (events), engine state, wallets (game_progress) and ratings (feedback).
//
// Filters (all optional, from the Analytics filter bar): university, batch, a date range (days back, or from/to),
// plus the test-data rules from Admin → Settings, which are always applied. A university-scoped admin is always
// held to their own university. Nothing here writes to student data.
import { all, one } from './db.js';
import { realStudentsSql } from './settings.js';
import { ladderFor } from './engine.js';

const DAY = 864e5, IST = 5.5 * 36e5;
export const istDay = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(day + 'T00:00:00Z') - IST;
const midDay = (day) => dayStart(day) + 12 * 36e5;
const addDays = (day, n) => istDay(midDay(day) + n * DAY);
const DAY_SQL = (col) => `TO_CHAR(TO_TIMESTAMP(${col} / 1000) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// ---------- recording (called from the API)
export async function recordLogin(run, roll, university) {
  await run('INSERT INTO student_logins (roll_no, university, at) VALUES (?, ?, ?)', roll, university || null, Date.now());
}
// A ping arrives every ~30 s while the game is visible: add the time since the last ping (at most 45 s).
export async function recordPing(run, one_, roll) {
  const now = Date.now(), day = istDay(now);
  const r = await one_('SELECT last_at FROM activity WHERE roll_no = ? AND day = ?', roll, day);
  const add = r ? Math.max(0, Math.min(45000, now - Number(r.last_at))) : 15000;
  await run(`INSERT INTO activity (roll_no, day, ms, pings, first_at, last_at) VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT (roll_no, day) DO UPDATE SET ms = activity.ms + ?, pings = activity.pings + 1, last_at = excluded.last_at`, roll, day, add, now, now, add);
}

// ---------- filters
// The period: `from`..`to` (IST days, inclusive) when given, else the last `days` days up to today.
export function windowOf({ days = 30, from = null, to = null } = {}) {
  const today = istDay(Date.now());
  let end = isDay(to) && to <= today ? to : today;
  let start = isDay(from) ? from : addDays(end, -(Math.max(1, Math.min(3650, Number(days) || 30)) - 1));
  if (start > end) [start, end] = [end, start];
  const n = Math.round((midDay(end) - midDay(start)) / DAY) + 1;
  return { days: n, from: start, to: end, fromMs: dayStart(start), toMs: dayStart(end) + DAY, list: Array.from({ length: n }, (_, i) => addDays(start, i)) };
}
// The students counted: active, real (test rules), and of the chosen university and batch.
function cohortWhere({ uni = null, batch = null, rules }, alias = 'm') {
  const R = realStudentsSql(rules, alias);
  const w = [`${alias}.active = 1`, R.sql], a = [...R.args];
  if (uni) { w.push(`${alias}.university = ?`); a.push(uni); }
  if (batch) { w.push(`COALESCE(${alias}.batch, '') = ?`); a.push(batch === '(none)' ? '' : batch); }
  return { sql: w.join(' AND '), args: a };
}
// The choices for the filter dropdowns: universities and batches that have real students.
export async function filterOptions({ uni = null, rules }) {
  const C = cohortWhere({ rules });
  const unis = await all(`SELECT m.university AS name, COUNT(*)::int AS n FROM students_master m WHERE ${C.sql} AND COALESCE(m.university, '') <> ''
    GROUP BY m.university ORDER BY m.university`, ...C.args);
  const B = cohortWhere({ uni, rules });
  const batches = await all(`SELECT COALESCE(NULLIF(m.batch, ''), '(none)') AS name, COUNT(*)::int AS n FROM students_master m WHERE ${B.sql}
    GROUP BY 1 ORDER BY 1`, ...B.args);
  const since = await one('SELECT MIN(at) AS at FROM student_logins');
  return { universities: unis, batches: batches.length > 1 || (batches[0] && batches[0].name !== '(none)') ? batches : [],
    loginsSince: since && since.at ? istDay(Number(since.at)) : null };
}

// ---------- the raw rows a period needs, each tagged with the student's university
async function load(F, W) {
  const C = cohortWhere(F);
  const [cohort, logins, act, ans, ev, tr, prizes, fb, states, days] = await Promise.all([
    all(`SELECT m.roll_no, m.university, (m.last_login_at IS NOT NULL OR EXISTS (SELECT 1 FROM attempts a WHERE a.roll_no = m.roll_no)) AS activated
      FROM students_master m WHERE ${C.sql}`, ...C.args),
    all(`SELECT l.roll_no, l.at FROM student_logins l JOIN students_master m ON m.roll_no = l.roll_no WHERE ${C.sql} AND l.at >= ? AND l.at < ?`, ...C.args, W.fromMs, W.toMs),
    all(`SELECT a.roll_no, a.day, a.ms FROM activity a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql} AND a.day >= ? AND a.day <= ?`, ...C.args, W.from, W.to),
    all(`SELECT a.roll_no, a.mode, a.correct, a.timeout, a.ms, a.lifelines, a.skill, a.type, a.level, ${DAY_SQL('a.at')} AS day
      FROM attempts a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql} AND a.at >= ? AND a.at < ?`, ...C.args, W.fromMs, W.toMs),
    all(`SELECT e.roll_no, e.kind, e.data FROM events e JOIN students_master m ON m.roll_no = e.roll_no
      WHERE ${C.sql} AND e.at >= ? AND e.at < ? AND e.kind IN ('run_start', 'fff')`, ...C.args, W.fromMs, W.toMs),
    all(`SELECT t.roll_no, t.kind FROM transitions t JOIN students_master m ON m.roll_no = t.roll_no
      WHERE ${C.sql} AND t.at >= ? AND t.at < ? AND t.kind IN ('level_up', 'skill_done')`, ...C.args, W.fromMs, W.toMs),
    all(`SELECT g.roll_no, g.best FROM game_progress g JOIN students_master m ON m.roll_no = g.roll_no WHERE ${C.sql}`, ...C.args),
    all(`SELECT f.roll_no, f.ctx FROM feedback f JOIN students_master m ON m.roll_no = f.roll_no WHERE ${C.sql} AND f.at >= ? AND f.at < ?`, ...C.args, W.fromMs, W.toMs),
    all(`SELECT e.roll_no, e.state FROM engine_state e JOIN students_master m ON m.roll_no = e.roll_no WHERE ${C.sql}`, ...C.args),
    // every active day of every student (a day with time on the portal, a login or an answer), up to the period's end
    all(`SELECT roll_no, day FROM (
        SELECT a.roll_no, a.day FROM activity a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql}
        UNION SELECT l.roll_no, ${DAY_SQL('l.at')} FROM student_logins l JOIN students_master m ON m.roll_no = l.roll_no WHERE ${C.sql}
        UNION SELECT t.roll_no, ${DAY_SQL('t.at')} FROM attempts t JOIN students_master m ON m.roll_no = t.roll_no WHERE ${C.sql}
      ) x WHERE day <= ?`, ...C.args, ...C.args, ...C.args, W.to)
  ]);
  const AD = new Map();
  for (const r of days) { if (!AD.has(r.roll_no)) AD.set(r.roll_no, new Set()); AD.get(r.roll_no).add(r.day); }
  return { cohort, logins, act, ans, ev, tr, prizes, fb, states, AD };
}
// Keep only one university's rows (for the comparison)
function only(raw, rolls) {
  const has = (r) => rolls.has(r.roll_no);
  return { cohort: raw.cohort.filter(has), logins: raw.logins.filter(has), act: raw.act.filter(has), ans: raw.ans.filter(has), ev: raw.ev.filter(has),
    tr: raw.tr.filter(has), prizes: raw.prizes.filter(has), fb: raw.fb.filter(has), states: raw.states.filter(has),
    AD: new Map([...raw.AD].filter(([r]) => rolls.has(r))) };
}

// ---------- every metric, from the raw rows
function compute(raw, W, G) {
  const { cohort, logins, act, ans, ev, tr, prizes, fb, states, AD } = raw;
  const inW = (d) => d >= W.from && d <= W.to;
  const firstDay = new Map([...AD].map(([r, s]) => [r, [...s].sort()[0]]));
  const activeInW = [...AD].filter(([, s]) => [...s].some(inW)).length;
  const newInW = [...firstDay].filter(([, d]) => inW(d)).length;
  const dau = (day) => [...AD].filter(([, s]) => s.has(day)).length;
  const back = (n) => Array.from({ length: n }, (_, i) => addDays(W.to, -i));
  const activeIn = (list) => [...AD].filter(([, s]) => list.some((d) => s.has(d))).length;
  const avgDau = W.list.reduce((n, d) => n + dau(d), 0) / W.list.length;
  const mau = activeIn(back(30)), wau = activeIn(back(7));
  const timeMs = act.reduce((n, r) => n + Number(r.ms), 0), studentDays = act.filter((r) => Number(r.ms) > 0).length;
  const right = ans.filter((a) => a.correct).length;
  const fff = ev.filter((e) => e.kind === 'fff'), fffWon = fff.filter((e) => e.data && e.data.ok).length;
  const players = new Set(ans.map((a) => a.roll_no));
  const starters = new Set(G ? G.skills.filter((s) => s.starter).map((s) => s.id) : []);
  const cleared = states.map((s) => Object.entries((s.state && s.state.skills) || {}).filter(([id, k]) => k.status === 'done' && !starters.has(id) && (!G || G.idx[id] != null)).length);
  const ret = (n) => { const elig = [...firstDay].filter(([, d]) => addDays(d, n) <= W.to);
    const kept = elig.filter(([r, d]) => AD.get(r).has(addDays(d, n))).length; return { value: pct(kept, elig.length), basis: elig.length }; };
  const inactive7 = [...AD].filter(([, s]) => ![...s].some((d) => d > addDays(W.to, -7))).length;
  const stars = fb.map((f) => Number(f.ctx && f.ctx.stars)).filter((x) => x >= 1 && x <= 11);
  return {
    students: cohort.length, activated: cohort.filter((c) => c.activated).length, active: activeInW, newInW, returning: activeInW - newInW,
    dauEnd: dau(W.to), avgDau: round1(avgDau), wau, mau, stickiness: mau ? pct(avgDau, mau) : null,
    logins: logins.length, timeMs, timePerDay: studentDays ? timeMs / studentDays : null, timePerActive: activeInW ? timeMs / activeInW : null,
    games: ev.filter((e) => e.kind === 'run_start').length, fffRate: pct(fffWon, fff.length), fffN: fff.length,
    answers: ans.length, perPlayer: players.size ? round1(ans.length / players.size) : null, players: players.size,
    accuracy: pct(right, ans.length), medianMs: median(ans.map((a) => Number(a.ms)).filter((x) => x > 0)),
    timeouts: pct(ans.filter((a) => a.timeout).length, ans.length), lifelines: pct(ans.filter((a) => Array.isArray(a.lifelines) && a.lifelines.length).length, ans.length),
    levelUps: tr.filter((t) => t.kind === 'level_up').length, skillsDone: tr.filter((t) => t.kind === 'skill_done').length,
    withSkill: cleared.filter((n) => n > 0).length, skillsPer: states.length ? round1(cleared.reduce((a, b) => a + b, 0) / states.length) : null,
    prizeWinners: prizes.filter((p) => Number(p.best) > 0).length,
    d1: ret(1), d7: ret(7), inactive7, everActive: firstDay.size,
    ratings: stars.length, avgStars: stars.length ? round1(stars.reduce((a, b) => a + b, 0) / stars.length) : null
  };
}

// ---------- the business view
export async function overview(F, G) {
  const W = windowOf(F), raw = await load(F, W), x = compute(raw, W, G);
  const since = F.loginsSince ? ` (recorded since ${F.loginsSince})` : '';
  const M = (label, value, unit, def, extra = {}) => ({ label, value, unit, def, ...extra });
  const groups = [
    { name: 'Reach', metrics: [
      M('Students on the list', x.students, 'count', 'Active students on the uploaded list, test data excluded.'),
      M('Activated', x.activated, 'count', 'Logged in or answered at least once, ever.', { of: x.students }),
      M('Active in period', x.active, 'count', 'Logged in, had the game open or answered on at least one day in the period.', { of: x.students }),
      M('New in period', x.newInW, 'count', 'Students whose first active day falls in the period.'),
      M('Returning in period', x.returning, 'count', 'Active in the period, first active before it.') ] },
    { name: 'Activity', metrics: [
      M('DAU (last day)', x.dauEnd, 'count', `Students active on ${W.to} (IST), the last day of the period.`),
      M('Avg. DAU', x.avgDau, 'count', 'Average daily active students over the period.'),
      M('WAU', x.wau, 'count', 'Students active in the 7 days up to the end of the period.'),
      M('MAU', x.mau, 'count', 'Students active in the 30 days up to the end of the period.'),
      M('Stickiness (DAU/MAU)', x.stickiness, 'pct', 'Average DAU as a share of MAU: how often a monthly player comes back.'),
      M('Logins', x.logins, 'count', 'Logins in the period' + since + '.'),
      M('Time on portal', x.timeMs, 'ms', 'Time with the game open and visible, all students, in the period' + since + '.'),
      M('Time per active day', x.timePerDay, 'ms', 'Average visible time per student on the days they played.') ] },
    { name: 'Gameplay', metrics: [
      M('Games started', x.games, 'count', 'Hot-seat games started (after Fastest Finger).'),
      M('Fastest Finger win rate', x.fffRate, 'pct', 'Puzzles won out of puzzles finished.', { basis: x.fffN }),
      M('Questions answered', x.answers, 'count', 'All answers in the period.'),
      M('Questions per player', x.perPlayer, 'count', 'Answers per student who answered at least once in the period.'),
      M('Accuracy', x.accuracy, 'pct', 'Right answers out of all answers.'),
      M('Median answer time', x.medianMs, 'ms', 'Time from the question appearing to locking the answer.'),
      M('Timed out', x.timeouts, 'pct', 'Answers where the clock ran out.'),
      M('Lifeline use', x.lifelines, 'pct', 'Answers where a lifeline (50:50, hint, flip) was used.') ] },
    { name: 'Progress', metrics: [
      M('Level-ups', x.levelUps, 'count', 'Levels cleared (two right in a row) in the period.'),
      M('Skills cleared', x.skillsDone, 'count', 'Skills finished (L4 cleared) in the period.'),
      M('Students with a skill cleared', x.withSkill, 'count', 'Students who have finished at least one skill (starter skills not counted), ever.', { of: x.students }),
      M('Skills cleared per player', x.skillsPer, 'count', 'Average skills finished by students who have started, ever.'),
      M('Won a prize', x.prizeWinners, 'count', 'Students who have cleared at least one skill group (first prize or more), ever.', { of: x.students }) ] },
    { name: 'Retention', metrics: [
      M('D1 retention', x.d1.value, 'pct', 'Of students whose first day was at least 1 day before the end of the period, the share who came back the next day.', { basis: x.d1.basis }),
      M('D7 retention', x.d7.value, 'pct', 'Of students whose first day was at least 7 days before the end of the period, the share active again 7 days later.', { basis: x.d7.basis }),
      M('Inactive 7+ days', x.inactive7, 'count', 'Students active before, with no activity in the last 7 days of the period.', { of: x.everActive }) ] },
    { name: 'Feedback', metrics: [
      M('Ratings', x.ratings, 'count', 'Star ratings sent in the period (per question, per game and general).'),
      M('Average rating', x.avgStars, 'stars', 'Average of the star ratings.') ] }
  ];
  const { ans, act, states, prizes, AD } = raw;
  const daily = W.list.map((d) => ({ day: d, active: [...AD].filter(([, s]) => s.has(d)).length, answers: ans.filter((a) => a.day === d).length,
    ms: act.filter((r) => r.day === d).reduce((n, r) => n + Number(r.ms), 0) }));
  const now = {};
  for (const s of states) {
    const sk = (s.state && s.state.skills) || {};
    const cur = G ? G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open' && sk[S.id].q > 0) || G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open') : null;
    if (cur) { const k = cur.id; now[k] = now[k] || { id: k, name: cur.name, group: cur.group, students: 0, levels: [0, 0, 0, 0] }; now[k].students++; now[k].levels[(sk[k].level || 1) - 1]++; }
  }
  const bySkill = {}, byType = {};
  for (const a of ans) {
    (bySkill[a.skill] ||= { id: a.skill, n: 0, right: 0, students: new Set() }); bySkill[a.skill].n++; if (a.correct) bySkill[a.skill].right++; bySkill[a.skill].students.add(a.roll_no);
    const k = 'L' + a.level + ' ' + a.type; (byType[k] ||= { key: k, n: 0, right: 0, ms: [] }); byType[k].n++; if (a.correct) byType[k].right++; byType[k].ms.push(Number(a.ms) || 0);
  }
  const bands = {}; for (const p of prizes) bands[Number(p.best) || 0] = (bands[Number(p.best) || 0] || 0) + 1;
  const skillName = (id) => (G && G.idx[id] != null ? G.skills[G.idx[id]].name : id);
  const ladder = G ? ladderFor(G.groups.length) : [];
  return {
    ladder,
    filters: { university: F.uni || null, batch: F.batch || null }, days: W.days, from: W.from, to: W.to, groups, daily,
    nowAt: Object.values(now).sort((a, b) => b.students - a.students).slice(0, 15),
    skills: Object.values(bySkill).filter((s) => s.n >= 10).map((s) => ({ id: s.id, name: skillName(s.id), n: s.n, acc: pct(s.right, s.n), students: s.students.size })).sort((a, b) => a.acc - b.acc),
    types: Object.values(byType).filter((t) => t.n >= 10).map((t) => ({ key: t.key, n: t.n, acc: pct(t.right, t.n), medianMs: median(t.ms) })).sort((a, b) => a.acc - b.acc),
    prizes: Object.entries(bands).map(([b, n]) => ({ prizes: Number(b), rupees: Number(b) ? ladder[Number(b) - 1] || 0 : 0, students: n })).sort((a, b) => a.prizes - b.prizes)
  };
}

// ---------- university-wise comparison: the same metrics, one row per university (plus the total)
export async function compareUniversities(F, G) {
  const W = windowOf(F), raw = await load({ ...F, uni: F.uni || null }, W);
  const byUni = new Map();
  for (const c of raw.cohort) { const u = c.university || '(no university)'; if (!byUni.has(u)) byUni.set(u, new Set()); byUni.get(u).add(c.roll_no); }
  const row = (name, x) => ({ university: name, students: x.students, activated: x.activated, activatedPct: pct(x.activated, x.students),
    active: x.active, activePct: pct(x.active, x.students), avgDau: x.avgDau, wau: x.wau, logins: x.logins, timePerActive: x.timePerActive,
    answers: x.answers, perPlayer: x.perPlayer, accuracy: x.accuracy, medianMs: x.medianMs, fffRate: x.fffRate, games: x.games,
    levelUps: x.levelUps, skillsDone: x.skillsDone, withSkillPct: pct(x.withSkill, x.students), prizeWinnersPct: pct(x.prizeWinners, x.students),
    d1: x.d1.value, d7: x.d7.value, avgStars: x.avgStars });
  const rows = [...byUni].map(([u, rolls]) => row(u, compute(only(raw, rolls), W, G))).sort((a, b) => (a.university === '(no university)') - (b.university === '(no university)') || b.students - a.students);
  return { days: W.days, from: W.from, to: W.to, filters: { university: F.uni || null, batch: F.batch || null }, rows, total: row('All universities', compute(raw, W, G)) };
}

// ---------- one row per student
export async function studentRows(F, G, { q = '', sort = 'recent', limit = 2000 } = {}) {
  const W = windowOf(F), C = cohortWhere(F), args = [...C.args];
  let where = C.sql;
  if (q) { where += ' AND (m.roll_no ILIKE ? OR m.name ILIKE ?)'; args.push('%' + q + '%', '%' + q + '%'); }
  const rows = await all(`SELECT m.roll_no, m.name, m.university, m.batch, m.last_login_at,
      a.ms, a.days_active, a.last_day, l.logins, t.answers, t.right_n, t.hot, t.last_answer,
      g.best, g.coins, g.data AS gp, e.state
    FROM students_master m
    LEFT JOIN (SELECT roll_no, SUM(ms) AS ms, COUNT(*) AS days_active, MAX(day) AS last_day FROM activity WHERE day >= ? AND day <= ? GROUP BY roll_no) a ON a.roll_no = m.roll_no
    LEFT JOIN (SELECT roll_no, COUNT(*) AS logins FROM student_logins WHERE at >= ? AND at < ? GROUP BY roll_no) l ON l.roll_no = m.roll_no
    LEFT JOIN (SELECT roll_no, COUNT(*) AS answers, SUM(correct) AS right_n, SUM(CASE WHEN mode = 'hotseat' THEN 1 ELSE 0 END) AS hot, MAX(at) AS last_answer
               FROM attempts WHERE at >= ? AND at < ? GROUP BY roll_no) t ON t.roll_no = m.roll_no
    LEFT JOIN game_progress g ON g.roll_no = m.roll_no
    LEFT JOIN engine_state e ON e.roll_no = m.roll_no
    WHERE ${where} LIMIT ?`, W.from, W.to, W.fromMs, W.toMs, W.fromMs, W.toMs, ...args, Math.min(5000, limit));
  const starters = new Set(G ? G.skills.filter((s) => s.starter).map((s) => s.id) : []);
  const ladder = G ? ladderFor(G.groups.length) : [];
  const out = rows.map((r) => {
    const sk = (r.state && r.state.skills) || {};
    const done = Object.entries(sk).filter(([id, k]) => k.status === 'done' && !starters.has(id) && (!G || G.idx[id] != null)).length;
    const cur = G ? (G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open' && sk[S.id].q > 0) || G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open')) : null;
    const lastActive = Math.max(Number(r.last_login_at) || 0, Number(r.last_answer) || 0, r.last_day ? midDay(r.last_day) : 0) || null;
    return {
      roll_no: r.roll_no, name: r.name, university: r.university || '', batch: r.batch || '', lastActive,
      ms: Number(r.ms) || 0, daysActive: Number(r.days_active) || 0, logins: Number(r.logins) || 0,
      answers: Number(r.answers) || 0, accuracy: pct(Number(r.right_n) || 0, Number(r.answers) || 0), hot: Number(r.hot) || 0,
      skillsDone: done, nowAt: cur ? { id: cur.id, name: cur.name, level: sk[cur.id].level } : null,
      prizes: Number(r.best) || 0, prizeRupees: Number(r.best) ? ladder[Number(r.best) - 1] || 0 : 0, coins: Number(r.coins) || 0, games: Number((r.gp && r.gp.runs) || 0), totalMs: Number((r.gp && r.gp.tOn) || 0)
    };
  });
  const S = { recent: (a, b) => (b.lastActive || 0) - (a.lastActive || 0), time: (a, b) => b.ms - a.ms, answers: (a, b) => b.answers - a.answers,
    accuracy: (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1), skills: (a, b) => b.skillsDone - a.skillsDone, wallet: (a, b) => b.coins - a.coins || b.prizes - a.prizes, prize: (a, b) => b.prizes - a.prizes || b.coins - a.coins, least: (a, b) => (a.lastActive || 0) - (b.lastActive || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name)), university: (a, b) => a.university.localeCompare(b.university) || String(a.name).localeCompare(String(b.name)) }[sort] || (() => 0);
  out.sort(S);
  return { days: W.days, from: W.from, to: W.to, total: out.length, ladder, rows: out };
}

// ---------- one student
export async function studentDetail(roll, F, G) {
  const W = windowOf(F);
  const [daily, ansDays, logins, recent, bySkill, tr] = await Promise.all([
    all('SELECT day, ms FROM activity WHERE roll_no = ? AND day >= ? AND day <= ? ORDER BY day', roll, W.from, W.to),
    all(`SELECT ${DAY_SQL('at')} AS day, COUNT(*)::int AS n, SUM(correct)::int AS right_n FROM attempts WHERE roll_no = ? AND at >= ? AND at < ? GROUP BY 1 ORDER BY 1`, roll, W.fromMs, W.toMs),
    all('SELECT at FROM student_logins WHERE roll_no = ? ORDER BY at DESC LIMIT 50', roll),
    all('SELECT skill, level, type, r, variant, mode, correct, timeout, ms, at FROM attempts WHERE roll_no = ? ORDER BY at DESC LIMIT 40', roll),
    all('SELECT skill, COUNT(*)::int AS n, SUM(correct)::int AS right_n FROM attempts WHERE roll_no = ? GROUP BY skill', roll),
    all("SELECT skill, kind, at FROM transitions WHERE roll_no = ? AND kind IN ('level_up', 'skill_done', 'unlock') ORDER BY at DESC LIMIT 40", roll)
  ]);
  const name = (id) => (G && G.idx[id] != null ? G.skills[G.idx[id]].name : id);
  const dayMap = {};
  for (const d of daily) (dayMap[d.day] ||= { day: d.day, ms: 0, answers: 0, right: 0 }).ms = Number(d.ms);
  for (const d of ansDays) { const x = (dayMap[d.day] ||= { day: d.day, ms: 0, answers: 0, right: 0 }); x.answers = d.n; x.right = d.right_n; }
  return {
    daily: Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day)),
    logins: logins.map((l) => Number(l.at)),
    recent: recent.map((a) => ({ ...a, name: name(a.skill), at: Number(a.at) })),
    skills: bySkill.map((s) => ({ id: s.skill, name: name(s.skill), n: s.n, acc: pct(s.right_n, s.n) })).sort((a, b) => b.n - a.n),
    steps: tr.map((t) => ({ ...t, name: name(t.skill), at: Number(t.at) }))
  };
}

// ---------- live now: students with the game open (pinged in the last `liveMs`), and what they are doing
const SCREEN = { home: 'Home', play: 'Hot seat', result: 'Results', fame: 'Hall of Fame', team: 'Team', path: 'My path', fff: 'Fastest Finger', seat: 'Walking to the hot seat',
  guide: 'How to play', wallet: 'Wallet', buddy: 'Pixel' };
export async function liveNow(F, G, liveMs = 75000) {
  const C = cohortWhere(F), now = Date.now(), today = istDay(now);
  const rows = await all(`SELECT p.roll_no, p.last_seen, p.since, p.screen, p.info, m.name, m.university, m.batch, e.pending, e.state,
      a.ms AS today_ms, t.n AS today_n, t.right_n AS today_right, t.last_at
    FROM presence p JOIN students_master m ON m.roll_no = p.roll_no
    LEFT JOIN engine_state e ON e.roll_no = p.roll_no
    LEFT JOIN activity a ON a.roll_no = p.roll_no AND a.day = ?
    LEFT JOIN (SELECT roll_no, COUNT(*)::int AS n, SUM(correct)::int AS right_n, MAX(at) AS last_at FROM attempts WHERE at >= ? GROUP BY roll_no) t ON t.roll_no = p.roll_no
    WHERE ${C.sql} AND p.last_seen > ? ORDER BY p.last_seen DESC LIMIT 3000`, today, dayStart(today), ...C.args, now - 15 * 60e3);
  const name = (id) => (G && G.idx[id] != null ? G.skills[G.idx[id]].name : id);
  const out = rows.map((r) => {
    const info = r.info || {}, pend = r.pending, sk = (r.state && r.state.skills) || {};
    const playing = r.screen === 'play' || r.screen === 'fff' || r.screen === 'seat';
    const mode = playing ? 'hotseat' : 'browsing';
    const q = playing && pend && pend.skill ? { skill: pend.skill, name: name(pend.skill), level: pend.level, type: pend.type, mode: pend.mode, servedAt: Number(pend.servedAt) || null } : null;
    const cur = G ? G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open' && sk[S.id].q > 0) || G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open') : null;
    return {
      roll_no: r.roll_no, name: r.name, university: r.university || '', batch: r.batch || '', live: Number(r.last_seen) > now - liveMs,
      lastSeen: Number(r.last_seen), since: Number(r.since) || null, screen: r.screen || null, doing: (r.screen && SCREEN[r.screen]) || 'On the portal',
      mode: r.screen ? mode : 'unknown', answeredThisGame: Number(info.answered) || 0, question: q,
      nowAt: cur ? { id: cur.id, name: cur.name, level: sk[cur.id].level } : null,
      todayMs: Number(r.today_ms) || 0, todayAnswers: Number(r.today_n) || 0, todayAcc: pct(Number(r.today_right) || 0, Number(r.today_n) || 0),
      lastAnswer: Number(r.last_at) || null
    };
  });
  const live = out.filter((r) => r.live), left = out.filter((r) => !r.live);
  const count = (f) => live.filter(f).length, byUni = {};
  for (const r of live) byUni[r.university || '(no university)'] = (byUni[r.university || '(no university)'] || 0) + 1;
  return {
    at: now, liveMs, filters: { university: F.uni || null, batch: F.batch || null },
    summary: { live: live.length, hotseat: count((r) => r.mode === 'hotseat'), browsing: count((r) => r.mode === 'browsing' || r.mode === 'unknown'),
      leftRecently: left.length, answersToday: live.reduce((n, r) => n + r.todayAnswers, 0) },
    byUniversity: Object.entries(byUni).map(([university, n]) => ({ university, n })).sort((a, b) => b.n - a.n),
    rows: live, recent: left.slice(0, 200)
  };
}
