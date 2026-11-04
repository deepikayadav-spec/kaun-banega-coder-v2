// End-to-end through the HTTP API on an in-memory PGlite database.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.PGLITE_MEMORY = 'true';
process.env.ALLOW_TEST_LOGIN = 'false';
const { default: app } = await import('../server/app.js');
const { ready, run, close } = await import('../server/db.js');
const { hashPassword } = await import('../server/auth.js');

const bank = Object.fromEntries(JSON.parse(fs.readFileSync('server/content/bank-S1-full.json', 'utf8')).questions.map((q) => [q.id, q]));
let server, base;
const jar = {};
async function call(who, method, url, body, raw) {
  const r = await fetch(base + url, {
    method, headers: { ...(body && !raw ? { 'content-type': 'application/json' } : {}), cookie: jar[who] || '' },
    body: raw ? body : body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

test.before(async () => {
  await ready();
  const now = Date.now();
  await run("INSERT INTO students_master (roll_no, name, university, created_at, updated_at) VALUES ('N26P02A0001', 'Asha Kumari Rao', 'ALARD - Pune', ?, ?)", now, now);
  await run("INSERT INTO admins (email, name, role, password_hash, must_change_pw, created_at) VALUES ('boss@x.in', 'Boss', 'super_admin', ?, 0, ?)", hashPassword('correct horse battery'), now);
  await run("INSERT INTO admins (email, name, role, university, password_hash, must_change_pw, created_at) VALUES ('mr@x.in', 'MR', 'admin', 'Malla Reddy University - Hyderabad', ?, 0, ?)", hashPassword('correct horse battery'), now);
  server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await close(); });

test('health reports the seeded bank', async () => {
  const r = await call('x', 'GET', '/api/health');
  assert.equal(r.status, 200);
  assert.ok(r.body.questions >= 600, 'questions ' + r.body.questions);
});

test('login: unknown id, wrong name, then the right name', async () => {
  assert.equal((await call('s', 'POST', '/api/auth/login', { roll: 'N26P02A9999', name: 'x' })).status, 404);
  assert.equal((await call('s', 'POST', '/api/auth/login', { roll: 'n26p02a0001', name: 'Ravi' })).status, 401);
  assert.equal((await call('s', 'GET', '/api/boot')).status, 401);
  assert.equal((await call('s', 'POST', '/api/auth/login', { roll: 'n26p02a0001', name: 'asha rao' })).status, 200);
  const b = await call('s', 'GET', '/api/boot');
  assert.equal(b.body.me.university, 'ALARD - Pune');
  assert.equal(b.body.engine.active, 'S1');
});

test('login with the first name alone works only when it is unique at the university', async () => {
  const now = Date.now();
  await run("INSERT INTO students_master (roll_no, name, university, created_at, updated_at) VALUES ('N26P02A0101', 'Kiran Mehta', 'ALARD - Pune', ?, ?), ('N26P02A0102', 'Kiran Joshi', 'ALARD - Pune', ?, ?), ('N26P02A0103', 'Zoya K Rahman', 'ALARD - Pune', ?, ?)", now, now, now, now, now, now);
  assert.equal((await call('f1', 'POST', '/api/auth/login', { roll: 'N26P02A0103', name: 'zoya' })).status, 200, 'unique first name');
  const dup = await call('f2', 'POST', '/api/auth/login', { roll: 'N26P02A0101', name: 'Kiran' });
  assert.equal(dup.status, 401, 'two Kirans at ALARD');
  assert.match(dup.body.error, /same first name/);
  assert.equal((await call('f2', 'POST', '/api/auth/login', { roll: 'N26P02A0101', name: 'Kiran Mehta' })).status, 200);
  assert.equal((await call('f3', 'POST', '/api/auth/login', { roll: 'N26P02A0103', name: 'Rahman' })).status, 401, 'only the first name counts');
});

test('a database seeded with older question types gets the new hot seat modes on boot', async () => {
  const { one } = await import('../server/db.js'), { seedIfEmpty, content } = await import('../server/bank.js');
  const modes = async () => { const r = await one("SELECT data FROM question_types WHERE key = 'faded'"); return (typeof r.data === 'string' ? JSON.parse(r.data) : r.data).modes; };
  await run(`UPDATE question_types SET data = ? WHERE key = 'faded'`, JSON.stringify({ ...JSON.parse(fs.readFileSync('server/content/question-types.json', 'utf8')).types.find((t) => t.key === 'faded'), modes: ['practice'] }));
  assert.deepEqual(await modes(), ['practice']);
  await seedIfEmpty();
  assert.deepEqual(await modes(), ['practice', 'hotseat']);
  assert.ok((await content()).typesDoc.types.find((t) => t.key === 'faded').modes.includes('hotseat'));
});

test('play: next is stable until answered; answers are graded and stored; S1 can be finished', async () => {
  const n1 = await call('s', 'GET', '/api/play/next?mode=hotseat');
  const n2 = await call('s', 'GET', '/api/play/next?mode=hotseat');
  assert.equal(n1.body.question.id, n2.body.question.id, 'refresh serves the same question');
  // answer wrong once
  const w = await call('s', 'POST', '/api/play/answer', { qid: n1.body.question.id, answer: {} });
  assert.equal(w.body.correct, false);
  assert.ok(w.body.show.length > 0);
  assert.equal((await call('s', 'POST', '/api/play/answer', { qid: n1.body.question.id, answer: {} })).status, 409, 'cannot answer twice');
  // then answer right until S1 is done, using the stored key (choice questions via the 50:50-free route: try each option)
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    const n = await call('s', 'GET', '/api/play/next?mode=hotseat');
    if (!n.body.question) break;
    const q = bank[n.body.question.id], c = n.body.question.payload, p = q.payload;
    let answer;
    switch (q.type) {
      case 'mcq': case 'explain': case 'happens': case 'problem': case 'input': case 'name':
        answer = { pick: c.options.indexOf(p.options.find((o) => o.correct).text) }; break;
      case 'match': answer = { pairs: p.answer }; break;
      case 'predict': answer = { text: p.expected }; break;
      case 'hunt': answer = { picks: p.answer }; break;
      case 'timeline': case 'pseudo': answer = { order: p.answer.map((x) => c.items.indexOf(x)) }; break;
      case 'group': answer = { groups: p.groups }; break;
      case 'same': answer = { pick: p.answer === 'Same' ? 0 : 1 }; break;
      case 'gap': answer = { cells: Object.fromEntries(p.rows.map((r) => [r.var, r.kind])) }; break;
      case 'bug': answer = { line: p.answer }; break;
      case 'fill': answer = { text: p.sample, stdout: p.target }; break;
      case 'parsons': answer = { order: p.sample.split('\n').map((l) => c.items.indexOf(l)), stdout: p.target }; break;
      case 'golf': answer = { picks: p.tokens.map((t) => t.choices.find((x) => x !== t.now && !/^["']/.test(x))), stdout: p.target }; break;
      // L4 code types (hot seat since 2 Nov): the browser runs the code and reports what it printed
      case 'faded': case 'write': answer = { code: p.sample, stdout: p.target }; break;
      case 'grow': answer = { code: p.sample, stdout: p.tiers[p.tiers.length - 1].expected }; break;
      case 'diverge': answer = { programs: p.samples.map((code) => ({ code, stdout: p.target })) }; break;
      default: throw new Error('hot seat served ' + q.type);
    }
    const a = await call('s', 'POST', '/api/play/answer', { qid: q.id, answer, ms: 1000, prefetch: true });
    assert.equal(a.body.correct, true, q.id + ' ' + a.body.why);
    if (a.body.next && a.body.next.question) {
      assert.equal(a.body.next.mode, 'hotseat');
      assert.equal(JSON.stringify(a.body.next.question).includes('"correct"'), false, 'prefetched question carries no key');
      const again = await call('s', 'GET', '/api/play/next?mode=hotseat');
      assert.equal(again.body.question.id, a.body.next.question.id, 'the prefetched question is the open one');
    }
    done = a.body.engine.skills.S1.status === 'done';
  }
  assert.ok(done, 'S1 finished');
  const after = await call('s', 'GET', '/api/play/next?mode=hotseat');
  assert.equal(after.body.question, null);
  assert.ok(after.body.comingSoon.includes('S2'));
});

test('progress is capped by what the engine allows; fame is per university', async () => {
  await call('s', 'PUT', '/api/progress', { progress: { coins: 7e7, best: 15, correct: 9, answered: 10 } });
  const f = await call('s', 'GET', '/api/fame');
  assert.equal(f.body.rows[0].coins, 0, 'no group cleared yet, so no coins');
  assert.equal(f.body.rows[0].me, true);
  assert.equal(f.body.scope, 'all');
  const u = await call('s', 'GET', '/api/fame?scope=uni');
  assert.equal(u.body.university, 'ALARD - Pune');
  assert.ok(u.body.rows.every((r) => r.university === 'ALARD - Pune'));
  assert.equal((await call('s', 'GET', '/api/fame?scope=uni&uni=Nowhere')).body.rows.length, 0);
  assert.equal((await call('s', 'POST', '/api/live')).body.live, 1);
});

test('admin: login, scoping, student history, bank dry-run, export', async () => {
  assert.equal((await call('a', 'POST', '/api/admin/login', { email: 'boss@x.in', password: 'nope' })).status, 401);
  assert.equal((await call('a', 'POST', '/api/admin/login', { email: 'boss@x.in', password: 'correct horse battery' })).status, 200);
  const st = await call('a', 'GET', '/api/admin/students');
  assert.ok(st.body.rows.some((r) => r.roll_no === 'N26P02A0001' && r.attempts > 5));
  const h = await call('a', 'GET', '/api/admin/students/N26P02A0001');
  assert.ok(h.body.transitions.some((t) => t.kind === 'skill_done'));
  const bad = await call('a', 'POST', '/api/admin/bank/upload?dry=1', { questions: [{ id: 'nope' }] });
  assert.equal(bad.body.ok, false);
  const csvR = await call('a', 'GET', '/api/admin/export/attempts.csv');
  assert.ok(String(csvR.body).startsWith('roll_no,'));
  const imp = await call('a', 'POST', '/api/admin/students/import?mode=merge&name=t.csv', 'NIAT ID,Name\nN26H02A0007,Meera K\n', true);
  assert.equal(imp.body.added, 1);
  // university-scoped admin sees only their campus
  await call('m', 'POST', '/api/admin/login', { email: 'mr@x.in', password: 'correct horse battery' });
  const ms = await call('m', 'GET', '/api/admin/students?university=ALARD%20-%20Pune');
  assert.deepEqual(ms.body.rows.map((r) => r.roll_no), ['N26H02A0007']);
  assert.equal((await call('m', 'POST', '/api/admin/bank/upload?dry=1', { questions: [] })).status, 403);
});

test('a new skill graph changes every path at once and keeps earned progress', async () => {
  const live = JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8'));
  const g = structuredClone(live);
  g.skills = g.skills.filter((s) => s.id !== 'S22');                       // removed (it has example questions)
  g.skills.find((s) => s.id === 'S2').req = [['S1'], ['S10']];               // S2 now also needs S10
  g.groups.push({ id: 'G15', cp: 'C4', name: 'Bonus round' });
  g.skills.push({ id: 'S99', name: 'A new skill', group: 'G15', cp: 'C4', req: [['S1']], rmax: 2 });

  // A question still open on the skill that is about to go.
  await run("UPDATE engine_state SET pending = ? WHERE roll_no = 'N26P02A0001'",
    JSON.stringify({ qid: 'gone', skill: 'S22', mode: 'hotseat', servedAt: Date.now(), client: { id: 'gone' }, address: {}, lifelines: [] }));

  const bad = await call('a', 'POST', '/api/admin/graph/upload?dry=1', { ...g, skills: [...g.skills, { id: 'S98', name: 'x', group: 'G1', req: [['S98']] }] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /requires itself/);

  const dry = await call('a', 'POST', '/api/admin/graph/upload?dry=1', g);
  assert.equal(dry.status, 200);
  assert.deepEqual(dry.body.diff.added, ['S99']);
  assert.deepEqual(dry.body.diff.removed, ['S22']);
  assert.deepEqual(dry.body.diff.reqChanged, ['S2']);
  assert.deepEqual(dry.body.diff.rungs, { before: 15, after: 16 });
  assert.ok(dry.body.impact.orphanQuestions > 0);
  assert.equal((await call('s', 'GET', '/api/boot')).body.graph.skills.length, JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8')).skills.length, 'a dry run changes nothing');

  const up = await call('a', 'POST', '/api/admin/graph/upload?name=g2.json', g);
  assert.equal(up.status, 200);
  const b = await call('s', 'GET', '/api/boot');
  assert.equal(b.body.graph.version, up.body.version);
  assert.equal(b.body.engine.graphVersion, up.body.version);
  assert.equal(b.body.graph.ladder.length, 16);
  assert.equal(b.body.graph.ladder[15], 7e7);
  const sk = b.body.engine.skills;
  assert.equal(sk.S1.status, 'done', 'earned progress kept');
  assert.equal(sk.S99.status, 'open', 'new skill joins the path');
  assert.equal(sk.S2.status, 'locked', 'untouched skill follows its new prerequisites');
  assert.equal(sk.S22, undefined, 'removed skill leaves the path');
  assert.equal((await call('s', 'GET', '/api/version')).body.graph, up.body.version);

  const n = await call('s', 'GET', '/api/play/next?mode=hotseat');
  assert.notEqual(n.body.resumed, true, 'the question on the removed skill is not served again');
  assert.equal(n.body.engine.graphVersion, up.body.version);

  // Roll back: the original graph is live again and S2 opens again.
  const h = await call('a', 'GET', '/api/admin/graph/history');
  assert.equal(h.body.rows.find((r) => r.active).version, up.body.version);
  assert.equal((await call('a', 'POST', '/api/admin/graph/activate', { version: JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8')).version })).status, 200);
  const r = await call('s', 'GET', '/api/boot');
  assert.equal(r.body.graph.ladder.length, 15);
  assert.equal(r.body.engine.skills.S2.status, 'open');
  assert.equal(r.body.engine.skills.S1.status, 'done');
});

test('graphs with checkpoints as a list and group.checkpoint are understood', async () => {
  // the built-in graph uses this shape (exported from the CT Skill Graph); upload it without any cp fields
  const live = JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8'));
  const g = { checkpoints: live.checkpoints, groups: live.groups.map(({ cp, ...x }) => x), skills: live.skills.map(({ cp, ...s }) => s) };
  g.groups[0].skills = ['S4', 'S1', 'S2', 'S5'];
  const up = await call('a', 'POST', '/api/admin/graph/upload', g);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const b = (await call('s', 'GET', '/api/boot')).body.graph;
  assert.equal(b.checkpoints.C1, live.checkpoints.find((c) => c.id === 'C1').name);
  assert.ok(b.groups.every((x) => x.cp), 'every group has its checkpoint');
  assert.ok(b.skills.every((x) => x.cp), 'every skill has its checkpoint');
  assert.deepEqual(b.skills.slice(0, 2).map((x) => x.id), ['S4', 'S1'], 'the group order is the path order');
  await call('a', 'POST', '/api/admin/graph/activate', { version: live.version });
});

test('feedback: once a student has sent it, the game knows not to ask again', async () => {
  assert.equal((await call('s', 'GET', '/api/boot')).body.me.feedbackGiven, false);
  // boot reports the student's visible time on the portal (from the live pings) for the 13-minute feedback pop-up
  assert.equal(typeof (await call('s', 'GET', '/api/boot')).body.me.timeOnMs, 'number');
  assert.equal((await call('s', 'POST', '/api/feedback', { text: 'Loved the maze puzzle', ctx: { stars: 5, trigger: 'after 5 min on the platform' } })).status, 200);
  assert.equal((await call('s', 'GET', '/api/boot')).body.me.feedbackGiven, true);
  // a star rating alone is accepted; a question rating does not count as the general feedback
  assert.equal((await call('s', 'POST', '/api/feedback', { text: '', ctx: { stars: 4, kind: 'question', tags: ['clear question'] } })).status, 200);
  assert.equal((await call('s', 'POST', '/api/feedback', { text: '', ctx: {} })).status, 400);
  // the boot tells the game what was already sent, so nothing is asked twice
  const me = (await call('s', 'GET', '/api/boot')).body.me;
  assert.equal(me.gameRated, false);
  assert.equal((await call('s', 'POST', '/api/feedback', { text: '', ctx: { stars: 3, kind: 'game' } })).status, 200);
  assert.equal((await call('s', 'GET', '/api/boot')).body.me.gameRated, true);
});

test('a CT Skill Graph HTML export uploads as a graph; starter skills are done; a fresh start empties every journey', async () => {
  const live = JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8'));
  // a small export in the CT Skill Graph shape: const D = { … } inside a script, needs as [{ any: [...] }]
  const D = {
    source: 'test', checkpoints: [{ id: 'C1', name: 'Basics: first steps', groups: ['G1', 'G2'] }],
    groups: [{ id: 'G1', checkpoint: 'C1', name: 'First steps', skills: ['S10', 'S4', 'S1', 'S2'] }, { id: 'G2', checkpoint: 'C1', name: 'Next', skills: ['S5'] }],
    skills: [
      { id: 'S10', name: 'Print values', group: 'G1', checkpoint: 'C1', starter: true, needs: [] },
      { id: 'S4', name: 'Store and update a value', group: 'G1', checkpoint: 'C1', starter: true, needs: [] },
      { id: 'S1', name: 'Tell types apart', group: 'G1', checkpoint: 'C1', foundation: true, needs: [] },
      { id: 'S2', name: 'Know what a string is', group: 'G1', checkpoint: 'C1', needs: [{ any: ['S1'], main: 'S1' }] },
      { id: 'S5', name: 'Convert', group: 'G2', checkpoint: 'C1', needs: [{ any: ['S1'] }, { any: ['S4', 'S10'] }] }
    ]
  };
  const html = `<!doctype html><html><body><div id="facts"></div><script>\nconst D = ${JSON.stringify(D)};\ndocument.getElementById("facts").textContent = "x";</script></body></html>`;
  assert.equal((await call('a', 'POST', '/api/admin/graph/upload?dry=1', { html: '<html>no data</html>' })).status, 400);
  const dry = await call('a', 'POST', '/api/admin/graph/upload?dry=1', { html });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.deepEqual(dry.body.converted, { skills: 5, groups: 2, checkpoints: 1, starters: ['S10', 'S4'] });

  // the student has earned something under the old graph
  await call('s', 'PUT', '/api/progress', { progress: { coins: 0, best: 0, correct: 3, answered: 4 }, epoch: 0 });
  const up = await call('a', 'POST', '/api/admin/graph/upload?fresh=1&name=CT.html', { html });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.ok(up.body.fresh && up.body.fresh.students >= 1);
  const b = (await call('s', 'GET', '/api/boot')).body;
  assert.deepEqual(b.graph.skills.map((s) => s.id), ['S10', 'S4', 'S1', 'S2', 'S5']);
  assert.equal(b.engine.skills.S10.status, 'done', 'starter skills are done');
  assert.equal(b.engine.skills.S4.status, 'done');
  assert.equal(b.engine.skills.S1.status, 'open', 'the first real topic is open');
  assert.equal(b.engine.skills.S2.status, 'locked');
  assert.equal(b.engine.active, 'S1', 'everyone starts from the beginning');
  assert.equal(b.progress, null, 'wallet cleared');
  assert.ok(b.epoch > 0);
  // a page opened before the fresh start can't save the old wallet back
  assert.equal((await call('s', 'PUT', '/api/progress', { progress: { coins: 0, correct: 3, answered: 4 }, epoch: 0 })).status, 409);
  assert.equal((await call('s', 'PUT', '/api/progress', { progress: { coins: 0, correct: 0, answered: 0 }, epoch: b.epoch })).status, 200);
  assert.equal((await call('a', 'POST', '/api/admin/progress/reset', { confirm: 'nope' })).status, 400);
  assert.equal((await call('a', 'POST', '/api/admin/progress/reset', { confirm: 'RESET' })).status, 200);
  await call('a', 'POST', '/api/admin/graph/activate', { version: live.version });
});

test('student analytics: overview, student rows and detail; logins and live pings are recorded', async () => {
  await call('s', 'POST', '/api/live'); await call('s', 'POST', '/api/live');
  const o = await call('a', 'GET', '/api/admin/stats/overview?days=30');
  assert.equal(o.status, 200, JSON.stringify(o.body));
  const names = o.body.groups.map((g) => g.name);
  assert.deepEqual(names, ['Reach', 'Activity', 'Gameplay', 'Progress', 'Retention', 'Feedback']);
  const m = Object.fromEntries(o.body.groups.flatMap((g) => g.metrics).map((x) => [x.label, x.value]));
  assert.ok(m['Questions answered'] > 0, 'answers counted');
  assert.ok(m['Logins'] >= 1, 'logins recorded');
  assert.ok(m['DAU (last day)'] >= 1);
  // the period starts at the first real login (today in this test), not 30 days back with empty days
  assert.equal(o.body.daily.length, 1);
  // both time averages are on the overview and in the university comparison, with the same names
  assert.ok('Time per active student' in m && 'Median time per student' in m && !('Time per active day' in m));
  assert.ok(['General rating', 'Game rating', 'Question rating'].every((k) => k in m));
  const cmp = await call('a', 'GET', '/api/admin/stats/compare?days=30');
  assert.equal(cmp.status, 200);
  assert.equal(cmp.body.total.timePerActive, m['Time per active student']);
  assert.equal(cmp.body.total.timeMedian, m['Median time per student']);
  // the money board comes with the analytics, so the admin page can show prizes in rupees
  assert.ok(Array.isArray(o.body.ladder) && o.body.ladder.length >= 2 && o.body.ladder[0] === 10, JSON.stringify(o.body.ladder));
  assert.ok(o.body.prizes.every((p) => p.rupees === (p.prizes ? o.body.ladder[p.prizes - 1] : 0)));
  const s = await call('a', 'GET', '/api/admin/stats/students?days=30&sort=answers');
  assert.equal(s.status, 200);
  const asha = s.body.rows.find((r) => r.roll_no === 'N26P02A0001');
  assert.ok(asha && asha.answers > 0 && asha.logins >= 1 && asha.ms > 0, JSON.stringify(asha));
  assert.ok('prizeRupees' in asha && 'coins' in asha);
  assert.equal((await call('a', 'GET', '/api/admin/stats/students?days=30&sort=wallet')).status, 200);
  const d = await call('a', 'GET', '/api/admin/stats/student/N26P02A0001?days=30');
  assert.equal(d.status, 200);
  assert.ok(d.body.recent.length > 0 && d.body.daily.length >= 1);
  const csvR = await call('a', 'GET', '/api/admin/stats/students.csv?days=30');
  assert.match(csvR.body, /^roll_no,name,university,last_active_ist/);
  assert.match(csvR.body.split(String.fromCharCode(10))[0], /prize_rupees,wallet_rupees/);
  // copy guard: blocked tries and leaving the tab during a question show up per student
  await call('s', 'POST', '/api/events', { events: [{ kind: 'guard', what: 'paste', screen: 'play', skill: 'S1', t: Date.now() },
    { kind: 'guard', what: 'tab', screen: 'play', skill: 'S1', t: Date.now() }, { kind: 'guard', what: 'keys', key: 'Ctrl+C', screen: 'fff', mode: 'order', t: Date.now() }] });
  const fl = (await call('a', 'GET', '/api/admin/stats/students?days=30&sort=flags')).body;
  assert.equal(fl.rows[0].roll_no, 'N26P02A0001');
  assert.equal(fl.rows[0].flags, 3);
  const g = (await call('a', 'GET', '/api/admin/stats/student/N26P02A0001?days=30')).body.guard;
  assert.equal(g.total, 3);
  assert.deepEqual(g.by.map((b) => b.what).sort(), ['keys', 'paste', 'tab']);
  assert.ok(g.recent.some((x) => x.what === 'keys' && x.key === 'Ctrl+C' && x.label === 'Blocked shortcut'));
  assert.ok(g.recent.some((x) => x.what === 'paste' && x.skillName && x.skillName !== 'S1'), JSON.stringify(g.recent));
  assert.match((await call('a', 'GET', '/api/admin/stats/students.csv?days=30')).body.split(String.fromCharCode(10))[0], /,flags$/);
  // a university-scoped admin only sees that university
  const mr = await call('m', 'GET', '/api/admin/stats/students?days=30');
  assert.ok(mr.body.rows.every((r) => r.university === 'Malla Reddy University - Hyderabad'));
  assert.equal((await call('m', 'GET', '/api/admin/stats/student/N26P02A0001')).status, 404);
});

test('analytics: university comparison, filters, test-data rules and university settings', async () => {
  const now = Date.now();
  await run("INSERT INTO students_master (roll_no, name, university, batch, created_at, updated_at) VALUES ('QA0001', 'Quality Check', 'Sandbox U', 'QA', ?, ?), ('N26P02A0200', 'Batch Kid', 'ALARD - Pune', 'B2', ?, ?)", now, now, now, now);
  // filters list real universities; nothing from the hardcoded code
  let f = await call('a', 'GET', '/api/admin/stats/filters');
  assert.equal(f.status, 200);
  assert.ok(f.body.universities.some((u) => u.name === 'ALARD - Pune'));
  assert.ok(f.body.universities.some((u) => u.name === 'Sandbox U'), 'not test data yet');
  // mark Sandbox U as test data: it drops out of filters, comparison and overview
  const put = await call('a', 'PUT', '/api/admin/settings/test-rules', { rollPrefixes: ['TEST', 'QA'], universities: ['Test', 'Sandbox U'], batches: [] });
  assert.equal(put.status, 200);
  assert.equal((await call('m', 'PUT', '/api/admin/settings/test-rules', { rollPrefixes: [] })).status, 403, 'super admin only');
  f = await call('a', 'GET', '/api/admin/stats/filters');
  assert.ok(!f.body.universities.some((u) => u.name === 'Sandbox U'));
  const c = await call('a', 'GET', '/api/admin/stats/compare?days=30');
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.ok(c.body.rows.length >= 1 && c.body.total.university === 'All universities');
  assert.ok(!c.body.rows.some((r) => r.university === 'Sandbox U'));
  const alard = c.body.rows.find((r) => r.university === 'ALARD - Pune');
  assert.ok(alard.answers > 0 && alard.students >= 2);
  // batch filter and a custom date range
  const fb = await call('a', 'GET', '/api/admin/stats/filters?university=' + encodeURIComponent('ALARD - Pune'));
  assert.ok(fb.body.batches.some((b) => b.name === 'B2'));
  const sb = await call('a', 'GET', '/api/admin/stats/students?batch=B2');
  assert.deepEqual(sb.body.rows.map((r) => r.roll_no), ['N26P02A0200']);
  const today = new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
  const od = await call('a', 'GET', `/api/admin/stats/overview?from=${today}&to=${today}`);
  assert.equal(od.body.days, 1);
  assert.equal(od.body.from, today);
  // a scoped admin's comparison holds only their university
  const mc = await call('m', 'GET', '/api/admin/stats/compare');
  assert.ok(mc.body.rows.every((r) => r.university === 'Malla Reddy University - Hyderabad'));
  // universities (NIAT ID prefixes) are data: add one and a new student's university is filled from it
  assert.equal((await call('a', 'PUT', '/api/admin/settings/universities/ZZ9', { name: 'Zed University' })).status, 200);
  const st = await call('a', 'GET', '/api/admin/settings');
  assert.ok(st.body.universities.some((u) => u.prefix === 'ZZ9' && u.name === 'Zed University'));
  assert.deepEqual(st.body.testRules.universities, ['Test', 'Sandbox U']);
  assert.equal((await call('a', 'POST', '/api/admin/students', { roll: 'ZZ9000001', name: 'Zed One' })).status, 200);
  const z = await call('a', 'GET', '/api/admin/students?q=ZZ9000001');
  assert.equal(z.body.rows[0].university, 'Zed University');
  assert.equal((await call('a', 'DELETE', '/api/admin/settings/universities/ZZ9')).status, 200);
  await call('a', 'PUT', '/api/admin/settings/test-rules', { rollPrefixes: ['TEST'], universities: ['Test'], batches: ['TEST'] });
});

test('analytics: live now lists who is on the portal and what they are doing', async () => {
  assert.equal((await call('s', 'POST', '/api/live', { screen: 'play', practice: false, answered: 3 })).status, 200);
  const l = await call('a', 'GET', '/api/admin/stats/live');
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const asha = l.body.rows.find((r) => r.roll_no === 'N26P02A0001');
  assert.ok(asha && asha.live && asha.mode === 'hotseat' && asha.doing === 'Hot seat' && asha.answeredThisGame === 3, JSON.stringify(asha));
  assert.ok(l.body.summary.live >= 1 && l.body.summary.hotseat >= 1);
  await call('s', 'POST', '/api/live', { screen: 'nonsense' });
  assert.equal((await call('a', 'GET', '/api/admin/stats/live')).body.rows.find((r) => r.roll_no === 'N26P02A0001').doing, 'Hot seat', 'unknown screens keep the last one');
  const mr = await call('m', 'GET', '/api/admin/stats/live');
  assert.ok(!mr.body.rows.some((r) => r.roll_no === 'N26P02A0001'), 'scoped admin sees only their university');
});

test('admin feedback leaves out test students (Admin > Settings test rules)', async () => {
  const now = Date.now();
  await run("INSERT INTO students_master (roll_no, name, university, created_at, updated_at) VALUES ('TEST0042', 'Tester', 'Test', ?, ?), ('N26P02A0777', 'Sandbox Kid', 'Test University', ?, ?) ON CONFLICT (roll_no) DO NOTHING", now, now, now, now);
  await run("INSERT INTO feedback (roll_no, text, ctx, at) VALUES ('TEST0042', 'test cred note', NULL, ?), ('N26P02A0777', 'test uni note', NULL, ?), ('TEST9999', 'orphan test note', NULL, ?), ('N26P02A0001', 'real note', NULL, ?)", now, now, now, now);
  await call('a', 'PUT', '/api/admin/settings/test-rules', { rollPrefixes: ['TEST'], universities: ['Test', 'Test University'], batches: ['TEST'] });
  const r = await call('a', 'GET', '/api/admin/feedback');
  assert.equal(r.status, 200);
  const texts = r.body.rows.map((x) => x.text);
  assert.ok(texts.includes('real note'));
  for (const t of ['test cred note', 'test uni note', 'orphan test note']) assert.ok(!texts.includes(t), t);
  // the CSV export has the same rows (test data left out), with the score spelled out
  await run(`INSERT INTO feedback (roll_no, text, ctx, at) VALUES ('N26P02A0001', 'loved it, a lot', ?, ?)`, JSON.stringify({ stars: 5, bonus: 6, kind: 'game', tags: ['fun', 'fast'] }), now);
  const c = await call('a', 'GET', '/api/admin/feedback.csv');
  assert.equal(c.status, 200);
  assert.match(c.body, /^at_ist,roll_no,name,university,form,stars,extra_stars,score,tags,feedback,/);
  assert.match(c.body, /,end of game,5,6,11,fun; fast,"loved it, a lot",/);
  assert.ok(c.body.includes('real note') && !c.body.includes('test cred note'));
});

test('bank replace: questions not in the new file are archived (kept, not served); dry run only counts', async () => {
  const live = async () => (await call('a', 'GET', '/api/admin/content')).body.total;
  const before = await live();
  const keep = Object.values(bank).slice(0, 3);
  assert.equal((await call('a', 'POST', '/api/admin/bank/replace', { ids: [] })).status, 400, 'an empty file never empties the bank');
  const dry = await call('a', 'POST', '/api/admin/bank/replace?dry=1', { ids: keep.map((q) => q.id) });
  assert.equal(dry.status, 200); assert.equal(dry.body.archived, before - 3); assert.equal(await live(), before, 'dry run changes nothing');
  assert.equal((await call('m', 'POST', '/api/admin/bank/replace', { ids: keep.map((q) => q.id) })).status, 403, 'super admins only');
  const up = await call('a', 'POST', '/api/admin/bank/upload', { questions: keep });
  assert.equal(up.body.counts.updated, 3);
  const r = await call('a', 'POST', '/api/admin/bank/replace?name=small.json', { ids: keep.map((q) => q.id) });
  assert.equal(r.body.archived, before - 3);
  assert.equal(await live(), 3);
  const other = Object.values(bank)[5];
  assert.equal((await call('a', 'GET', '/api/admin/questions/' + other.id)).body.status, 'archived', 'kept as archived, not deleted');
  // uploading the full bank again in replace mode brings everything back live
  const all = Object.values(bank);
  await call('a', 'POST', '/api/admin/bank/upload', { questions: all });
  assert.equal((await call('a', 'POST', '/api/admin/bank/replace', { ids: all.map((q) => q.id) })).body.archived, 0);
  // earlier tests uploaded a few questions of other skills; they are not in this file, so they stay archived
  assert.equal(await live(), all.length);
});
