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
  assert.equal((await call('s', 'POST', '/api/feedback', { text: 'Loved the maze puzzle', ctx: { stars: 5, trigger: 'after 5 min on the platform' } })).status, 200);
  assert.equal((await call('s', 'GET', '/api/boot')).body.me.feedbackGiven, true);
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
