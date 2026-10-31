// Student analytics for the admin console (the KBC counterpart of Saturday Sprint's analytics).
// Everything is computed from what the portal records: logins (student_logins), time with the game open
// (activity, from the 30-second "live" ping while the tab is visible), answers (attempts), engine steps (transitions),
// game events (events), engine state, wallets (game_progress) and ratings (feedback).
// TEST accounts are never counted. A university-scoped admin only sees that university. Nothing here writes.
import { all, one } from './db.js';

const DAY = 864e5, IST = 5.5 * 36e5;
export const istDay = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
const dayStart = (day) => Date.parse(day + 'T00:00:00Z') - IST;
const DAY_SQL = (col) => `TO_CHAR(TO_TIMESTAMP(${col} / 1000) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Record keeping (called from the API): one row per login, and visible time per student per IST day.
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

// The students counted: active, not TEST, of one university when scoped.
function cohortWhere(uni, alias = 'm') {
  const w = [`${alias}.active = 1`, `${alias}.roll_no NOT LIKE 'TEST%'`, `COALESCE(${alias}.university, '') <> 'Test'`], a = [];
  if (uni) { w.push(`${alias}.university = ?`); a.push(uni); }
  return { sql: w.join(' AND '), args: a };
}
function windowOf(days) {
  const today = istDay(Date.now());
  const d = Math.max(1, Math.min(3650, Number(days) || 30));
  const fromMs = dayStart(today) - (d - 1) * DAY;
  return { days: d, today, from: istDay(fromMs), fromMs, toMs: Date.now() + 1 };
}

// Every student's active days (IST): a day with time on the portal, a login or an answer.
async function activeDays(C, W) {
  const rows = await all(`SELECT roll_no, day FROM (
      SELECT a.roll_no, a.day FROM activity a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql}
      UNION SELECT l.roll_no, ${DAY_SQL('l.at')} FROM student_logins l JOIN students_master m ON m.roll_no = l.roll_no WHERE ${C.sql}
      UNION SELECT t.roll_no, ${DAY_SQL('t.at')} FROM attempts t JOIN students_master m ON m.roll_no = t.roll_no WHERE ${C.sql}
    ) x`, ...C.args, ...C.args, ...C.args);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.roll_no)) by.set(r.roll_no, new Set()); by.get(r.roll_no).add(r.day); }
  return by;
}

// ---------- the business view: Reach → Activity → Gameplay → Progress → Retention → Feedback
export async function overview({ uni = null, days = 30, G = null } = {}) {
  const W = windowOf(days), C = cohortWhere(uni);
  const inW = (d) => d >= W.from && d <= W.today;
  const [cohort, ever, logins, act, ans, ev, tr, prizes, fb, states] = await Promise.all([
    one(`SELECT COUNT(*)::int AS n FROM students_master m WHERE ${C.sql}`, ...C.args),
    one(`SELECT COUNT(*)::int AS n FROM students_master m WHERE ${C.sql} AND (m.last_login_at IS NOT NULL OR EXISTS (SELECT 1 FROM attempts a WHERE a.roll_no = m.roll_no))`, ...C.args),
    all(`SELECT l.roll_no, l.at FROM student_logins l JOIN students_master m ON m.roll_no = l.roll_no WHERE ${C.sql} AND l.at >= ?`, ...C.args, W.fromMs),
    all(`SELECT a.roll_no, a.day, a.ms FROM activity a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql} AND a.day >= ?`, ...C.args, W.from),
    all(`SELECT a.roll_no, a.mode, a.correct, a.timeout, a.ms, a.lifelines, a.skill, a.type, a.level, ${DAY_SQL('a.at')} AS day
      FROM attempts a JOIN students_master m ON m.roll_no = a.roll_no WHERE ${C.sql} AND a.at >= ?`, ...C.args, W.fromMs),
    all(`SELECT e.roll_no, e.kind, e.data FROM events e JOIN students_master m ON m.roll_no = e.roll_no
      WHERE ${C.sql} AND e.at >= ? AND e.kind IN ('run_start', 'run_end', 'fff', 'practice_start')`, ...C.args, W.fromMs),
    all(`SELECT t.roll_no, t.kind, t.skill FROM transitions t JOIN students_master m ON m.roll_no = t.roll_no
      WHERE ${C.sql} AND t.at >= ? AND t.kind IN ('level_up', 'skill_done')`, ...C.args, W.fromMs),
    all(`SELECT g.best, g.coins FROM game_progress g JOIN students_master m ON m.roll_no = g.roll_no WHERE ${C.sql}`, ...C.args),
    all(`SELECT f.ctx FROM feedback f JOIN students_master m ON m.roll_no = f.roll_no WHERE ${C.sql} AND f.at >= ?`, ...C.args, W.fromMs),
    all(`SELECT e.roll_no, e.state FROM engine_state e JOIN students_master m ON m.roll_no = e.roll_no WHERE ${C.sql}`, ...C.args)
  ]);
  const AD = await activeDays(C, W);
  const firstDay = new Map([...AD].map(([r, s]) => [r, [...s].sort()[0]]));

  // Reach
  const activeInW = [...AD].filter(([, s]) => [...s].some(inW)).map(([r]) => r);
  const newInW = [...firstDay].filter(([, d]) => inW(d)).length;
  // Activity
  const dau = (day) => [...AD].filter(([, s]) => s.has(day)).length;
  const lastNDays = (n) => Array.from({ length: n }, (_, i) => istDay(Date.now() - i * DAY));
  const activeIn = (list) => [...AD].filter(([, s]) => list.some((d) => s.has(d))).length;
  const winDays = Array.from({ length: W.days }, (_, i) => istDay(dayStart(W.today) - i * DAY + 12 * 36e5)).reverse();
  const avgDau = winDays.reduce((n, d) => n + dau(d), 0) / winDays.length;
  const mau = activeIn(lastNDays(30)), wau = activeIn(lastNDays(7));
  const timeMs = act.reduce((n, r) => n + Number(r.ms), 0);
  const studentDays = act.filter((r) => Number(r.ms) > 0).length;
  // Gameplay
  const hot = ans.filter((a) => a.mode === 'hotseat'), right = ans.filter((a) => a.correct).length;
  const runs = ev.filter((e) => e.kind === 'run_start').length, fff = ev.filter((e) => e.kind === 'fff');
  const fffWon = fff.filter((e) => e.data && e.data.ok).length;
  const lifel = ans.filter((a) => Array.isArray(a.lifelines) && a.lifelines.length).length;
  const players = new Set(ans.map((a) => a.roll_no));
  // Progress (skills cleared ever, from engine state; starter skills are done for everyone, so they are not counted)
  const starters = new Set(G ? G.skills.filter((s) => s.starter).map((s) => s.id) : []);
  const cleared = states.map((s) => Object.entries((s.state && s.state.skills) || {}).filter(([id, k]) => k.status === 'done' && !starters.has(id) && (!G || G.idx[id] != null)).length);
  const withSkill = cleared.filter((n) => n > 0).length;
  const prizeBands = {}; for (const p of prizes) prizeBands[Number(p.best) || 0] = (prizeBands[Number(p.best) || 0] || 0) + 1;
  // Retention: of the students whose first day is at least n days ago, the share active again exactly n days later
  const ret = (n) => { const elig = [...firstDay].filter(([, d]) => dayStart(d) + n * DAY <= dayStart(W.today));
    const kept = elig.filter(([r, d]) => AD.get(r).has(istDay(dayStart(d) + n * DAY + 12 * 36e5))).length; return { value: pct(kept, elig.length), basis: elig.length }; };
  const lastDay = new Map([...AD].map(([r, s]) => [r, [...s].sort().pop()]));
  const inactive7 = [...lastDay].filter(([, d]) => dayStart(d) < dayStart(W.today) - 7 * DAY).length;
  // Feedback
  const stars = fb.map((f) => Number(f.ctx && f.ctx.stars)).filter((x) => x >= 1 && x <= 11);

  const M = (label, value, unit, def, extra = {}) => ({ label, value, unit, def, ...extra });
  const groups = [
    { name: 'Reach', metrics: [
      M('Students on the list', cohort.n, 'count', 'Active students on the uploaded list (TEST accounts excluded).'),
      M('Activated', ever.n, 'count', 'Logged in or answered at least once, ever.', { of: cohort.n }),
      M('Active in period', activeInW.length, 'count', 'Logged in, had the game open or answered on at least one day in the period.', { of: cohort.n }),
      M('New in period', newInW, 'count', 'Students whose first active day falls in the period.'),
      M('Returning in period', activeInW.length - newInW, 'count', 'Active in the period, first active before it.') ] },
    { name: 'Activity', metrics: [
      M('DAU (today)', dau(W.today), 'count', 'Students active today (IST).'),
      M('Avg. DAU', round1(avgDau), 'count', 'Average daily active students over the period.'),
      M('WAU', wau, 'count', 'Students active in the last 7 days.'),
      M('MAU', mau, 'count', 'Students active in the last 30 days.'),
      M('Stickiness (DAU/MAU)', mau ? pct(avgDau, mau) : null, 'pct', 'Average DAU as a share of MAU: how often a monthly player comes back.'),
      M('Logins', logins.length, 'count', 'Logins in the period (recorded from 31 Oct).'),
      M('Time on portal', timeMs, 'ms', 'Time with the game open and visible, all students, in the period (recorded from 31 Oct).'),
      M('Time per active day', studentDays ? timeMs / studentDays : null, 'ms', 'Average visible time per student on the days they played.') ] },
    { name: 'Gameplay', metrics: [
      M('Games started', runs, 'count', 'Hot-seat games started (after Fastest Finger).'),
      M('Fastest Finger win rate', pct(fffWon, fff.length), 'pct', 'Puzzles won out of puzzles finished.', { basis: fff.length }),
      M('Questions answered', ans.length, 'count', 'Hot seat and practice.'),
      M('Hot seat / practice', `${hot.length} / ${ans.length - hot.length}`, 'text', 'Answers in the hot seat and in practice.'),
      M('Questions per player', players.size ? round1(ans.length / players.size) : null, 'count', 'Answers per student who answered at least once in the period.'),
      M('Accuracy', pct(right, ans.length), 'pct', 'Right answers out of all answers.'),
      M('Median answer time', median(ans.map((a) => Number(a.ms)).filter((x) => x > 0)), 'ms', 'Time from the question appearing to locking the answer.'),
      M('Timed out', pct(ans.filter((a) => a.timeout).length, ans.length), 'pct', 'Answers where the clock ran out.'),
      M('Lifeline use', pct(lifel, ans.length), 'pct', 'Answers where a lifeline (50:50, hint, flip) was used.') ] },
    { name: 'Progress', metrics: [
      M('Level-ups', tr.filter((t) => t.kind === 'level_up').length, 'count', 'Levels cleared (two right in a row) in the period.'),
      M('Skills cleared', tr.filter((t) => t.kind === 'skill_done').length, 'count', 'Skills finished (L4 cleared) in the period.'),
      M('Students with a skill cleared', withSkill, 'count', 'Students who have finished at least one skill (starter skills not counted), ever.', { of: cohort.n }),
      M('Skills cleared per player', states.length ? round1(cleared.reduce((a, b) => a + b, 0) / Math.max(1, states.length)) : null, 'count', 'Average skills finished by students who have started, ever.'),
      M('Won a prize', prizes.filter((p) => Number(p.best) > 0).length, 'count', 'Students who have cleared at least one skill group (first prize or more), ever.', { of: cohort.n }) ] },
    { name: 'Retention', metrics: [
      M('D1 retention', ret(1).value, 'pct', 'Of students whose first day was at least 1 day ago, the share who came back the next day.', { basis: ret(1).basis }),
      M('D7 retention', ret(7).value, 'pct', 'Of students whose first day was at least 7 days ago, the share active again 7 days later.', { basis: ret(7).basis }),
      M('Inactive 7+ days', inactive7, 'count', 'Activated students with no activity in the last 7 days.', { of: firstDay.size }) ] },
    { name: 'Feedback', metrics: [
      M('Ratings', stars.length, 'count', 'Star ratings sent in the period (per question, per game and general).'),
      M('Average rating', stars.length ? round1(stars.reduce((a, b) => a + b, 0) / stars.length) : null, 'stars', 'Average of the star ratings.') ] }
  ];

  // Daily series over the period
  const daily = winDays.map((d) => ({ day: d, active: dau(d), answers: ans.filter((a) => a.day === d).length,
    ms: act.filter((r) => r.day === d).reduce((n, r) => n + Number(r.ms), 0) }));
  // Where students are now: their current skill
  const now = {};
  for (const s of states) {
    const sk = (s.state && s.state.skills) || {};
    const cur = G ? G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open' && sk[S.id].q > 0) || G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open') : null;
    if (cur) { const k = cur.id; now[k] = now[k] || { id: k, name: cur.name, group: cur.group, students: 0, levels: [0, 0, 0, 0] }; now[k].students++; now[k].levels[(sk[k].level || 1) - 1]++; }
  }
  // Skills and question types by accuracy (at least 10 answers)
  const bySkill = {}, byType = {};
  for (const a of ans) {
    (bySkill[a.skill] ||= { id: a.skill, n: 0, right: 0, students: new Set() }); bySkill[a.skill].n++; if (a.correct) bySkill[a.skill].right++; bySkill[a.skill].students.add(a.roll_no);
    const k = 'L' + a.level + ' ' + a.type; (byType[k] ||= { key: k, n: 0, right: 0, ms: [] }); byType[k].n++; if (a.correct) byType[k].right++; byType[k].ms.push(Number(a.ms) || 0);
  }
  const skillName = (id) => (G && G.idx[id] != null ? G.skills[G.idx[id]].name : id);
  return {
    university: uni, days: W.days, from: W.from, today: W.today, groups, daily,
    nowAt: Object.values(now).sort((a, b) => b.students - a.students).slice(0, 15),
    skills: Object.values(bySkill).filter((x) => x.n >= 10).map((x) => ({ id: x.id, name: skillName(x.id), n: x.n, acc: pct(x.right, x.n), students: x.students.size })).sort((a, b) => a.acc - b.acc),
    types: Object.values(byType).filter((x) => x.n >= 10).map((x) => ({ key: x.key, n: x.n, acc: pct(x.right, x.n), medianMs: median(x.ms) })).sort((a, b) => a.acc - b.acc),
    prizes: Object.entries(prizeBands).map(([b, n]) => ({ prizes: Number(b), students: n })).sort((a, b) => a.prizes - b.prizes)
  };
}

// ---------- one row per student
export async function studentRows({ uni = null, days = 30, q = '', sort = 'recent', G = null, limit = 2000 } = {}) {
  const W = windowOf(days), C = cohortWhere(uni), args = [...C.args];
  let where = C.sql;
  if (q) { where += ' AND (m.roll_no ILIKE ? OR m.name ILIKE ?)'; args.push('%' + q + '%', '%' + q + '%'); }
  const rows = await all(`SELECT m.roll_no, m.name, m.university, m.last_login_at,
      a.ms, a.days_active, a.last_day,
      l.logins, t.answers, t.right_n, t.hot, t.last_answer,
      g.best, g.coins, g.data AS gp, e.state
    FROM students_master m
    LEFT JOIN (SELECT roll_no, SUM(ms) AS ms, COUNT(*) AS days_active, MAX(day) AS last_day FROM activity WHERE day >= ? GROUP BY roll_no) a ON a.roll_no = m.roll_no
    LEFT JOIN (SELECT roll_no, COUNT(*) AS logins FROM student_logins WHERE at >= ? GROUP BY roll_no) l ON l.roll_no = m.roll_no
    LEFT JOIN (SELECT roll_no, COUNT(*) AS answers, SUM(correct) AS right_n, SUM(CASE WHEN mode = 'hotseat' THEN 1 ELSE 0 END) AS hot, MAX(at) AS last_answer FROM attempts WHERE at >= ? GROUP BY roll_no) t ON t.roll_no = m.roll_no
    LEFT JOIN game_progress g ON g.roll_no = m.roll_no
    LEFT JOIN engine_state e ON e.roll_no = m.roll_no
    WHERE ${where} LIMIT ?`, W.from, W.fromMs, W.fromMs, ...args, Math.min(5000, limit));
  const starters = new Set(G ? G.skills.filter((s) => s.starter).map((s) => s.id) : []);
  const out = rows.map((r) => {
    const sk = (r.state && r.state.skills) || {};
    const done = Object.entries(sk).filter(([id, k]) => k.status === 'done' && !starters.has(id) && (!G || G.idx[id] != null)).length;
    const cur = G ? (G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open' && sk[S.id].q > 0) || G.skills.find((S) => sk[S.id] && sk[S.id].status === 'open')) : null;
    const lastActive = Math.max(Number(r.last_login_at) || 0, Number(r.last_answer) || 0, r.last_day ? dayStart(r.last_day) + 12 * 36e5 : 0) || null;
    return {
      roll_no: r.roll_no, name: r.name, university: r.university || '', lastActive,
      ms: Number(r.ms) || 0, daysActive: Number(r.days_active) || 0, logins: Number(r.logins) || 0,
      answers: Number(r.answers) || 0, accuracy: pct(Number(r.right_n) || 0, Number(r.answers) || 0), hot: Number(r.hot) || 0,
      skillsDone: done, nowAt: cur ? { id: cur.id, name: cur.name, level: sk[cur.id].level } : null,
      prizes: Number(r.best) || 0, coins: Number(r.coins) || 0, games: Number((r.gp && r.gp.runs) || 0), totalMs: Number((r.gp && r.gp.tOn) || 0)
    };
  });
  const S = { recent: (a, b) => (b.lastActive || 0) - (a.lastActive || 0), time: (a, b) => b.ms - a.ms, answers: (a, b) => b.answers - a.answers,
    accuracy: (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1), skills: (a, b) => b.skillsDone - a.skillsDone, least: (a, b) => (a.lastActive || 0) - (b.lastActive || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name)) }[sort] || ((a, b) => 0);
  out.sort(S);
  return { days: W.days, from: W.from, total: out.length, rows: out };
}

// ---------- one student
export async function studentDetail(roll, { days = 30, G = null } = {}) {
  const W = windowOf(days);
  const [daily, ansDays, logins, recent, bySkill, tr] = await Promise.all([
    all('SELECT day, ms FROM activity WHERE roll_no = ? AND day >= ? ORDER BY day', roll, W.from),
    all(`SELECT ${DAY_SQL('at')} AS day, COUNT(*)::int AS n, SUM(correct)::int AS right_n FROM attempts WHERE roll_no = ? AND at >= ? GROUP BY 1 ORDER BY 1`, roll, W.fromMs),
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
