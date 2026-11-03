import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileGraph, buildAvail, typesFor, newState, activeSkill, address, applyAnswer, view } from '../server/engine.js';

const graph = JSON.parse(fs.readFileSync('server/content/skill-graph.json', 'utf8'));
const typesDoc = JSON.parse(fs.readFileSync('server/content/question-types.json', 'utf8'));
const bank = JSON.parse(fs.readFileSync('server/content/bank-S1-full.json', 'utf8')).questions;
const G = compileGraph(graph, typesDoc);

// A full bank for every skill, type, R and variant: the engine then behaves exactly like the original.
const fullAvail = () => {
  const rows = [];
  for (const S of G.skills) for (const t of typesDoc.types) for (let r = 1; r <= 3; r++) for (let v = 1; v <= 25; v++)
    rows.push({ skill: S.id, level: t.level, type: t.key, difficulty: r, variant: v });
  return buildAvail(rows);
};

test('roots start open, everything else locked', () => {
  const st = newState(G);
  const open = Object.entries(st.skills).filter(([, s]) => s.status === 'open').map(([k]) => k);
  assert.deepEqual(open.sort(), ['S1', 'S10', 'S4']);
});

test('two rights in a row level up; L4 finishes the skill and unlocks', () => {
  const A = fullAvail(), st = newState(G), id = 'S1';
  assert.equal(activeSkill(G, A, st).id, 'S1');
  const ans = (ok) => { const a = address(G, A, st, id, 'hotseat'); return applyAnswer(G, st, id, a.type, ok); };
  ans(true); assert.equal(st.skills.S1.rightStreak, 1);
  const r = ans(true); assert.equal(st.skills.S1.level, 2); assert.equal(r.transitions[0].kind, 'level_up');
  ans(true); ans(true); ans(true); ans(true); assert.equal(st.skills.S1.level, 4);
  ans(true); const fin = ans(true);
  assert.equal(st.skills.S1.status, 'done');
  const unlocked = fin.transitions.filter((t) => t.kind === 'unlock').map((t) => t.skill);
  for (const s of ['S2', 'S3', 'S5', 'S12', 'S13', 'S14', 'S17', 'S18', 'S54']) assert.ok(unlocked.includes(s), s + ' unlocked');
});

test('L1 climbs R before the streak counts (rmax 3)', () => {
  const A = fullAvail(), st = newState(G);
  for (const s of Object.keys(st.skills)) st.skills[s].status = 'done';
  st.skills.S7.status = 'open'; // rmax 3, starts at R2
  assert.equal(st.skills.S7.r, 2);
  const a = address(G, A, st, 'S7', 'hotseat');
  const r = applyAnswer(G, st, 'S7', a.type, true);
  assert.equal(st.skills.S7.r, 3); assert.equal(r.transitions[0].kind, 'r_up');
});

test('wrong at L1 on the starting R2 drops to R1; every answer moves on to the next type', () => {
  const A = fullAvail(), st = newState(G);
  st.skills.S1.status = 'done'; st.skills.S4.status = 'done'; st.skills.S10.status = 'done';
  st.skills.S2.status = 'open';
  assert.equal(activeSkill(G, A, st).id, 'S2');
  assert.equal(st.skills.S2.r, 2);
  const a0 = address(G, A, st, 'S2', 'hotseat');
  const r = applyAnswer(G, st, 'S2', a0.type, false);
  assert.equal(st.skills.S2.r, 1); assert.equal(r.transitions[0].kind, 'r_drop');
  const a1 = address(G, A, st, 'S2', 'hotseat');
  assert.notEqual(a1.type, a0.type, 'a miss moves on to the next type');
  applyAnswer(G, st, 'S2', a1.type, false);
  assert.notEqual(address(G, A, st, 'S2', 'hotseat').type, a1.type);
});

test('each level starts at T1 V1, cycles the types, then repeats them with the next variant; two right in a row levels up', () => {
  const A = fullAvail(), st = newState(G);
  for (const s of Object.keys(st.skills)) st.skills[s].status = 'done';
  st.skills.S5.status = 'open'; st.skills.S5.level = 2;   // L2 plays at rmax: no R climbing in the way
  const types = typesFor(G, A, G.skills[G.idx.S5], 2, 'hotseat');
  const seen = [];
  for (let i = 0; i < types.length + 1; i++) {
    const a = address(G, A, st, 'S5', 'hotseat');
    seen.push(a.type + ' V' + a.variant);
    applyAnswer(G, st, 'S5', a.type, false);   // wrong: stays on L2
  }
  assert.deepEqual(seen.slice(0, types.length), types.map((t) => t + ' V1'), 'T1 V1, T2 V1, … in order');
  assert.equal(seen[types.length], types[0] + ' V2', 'then T1 V2');
  let a = address(G, A, st, 'S5', 'hotseat'); applyAnswer(G, st, 'S5', a.type, true);
  a = address(G, A, st, 'S5', 'hotseat'); const r = applyAnswer(G, st, 'S5', a.type, true);
  assert.equal(r.transitions[0].kind, 'level_up');
  const n = address(G, A, st, 'S5', 'hotseat');
  assert.equal(n.level, 3);
  assert.equal(n.type, typesFor(G, A, G.skills[G.idx.S5], 3, 'hotseat')[0]);
  assert.equal(n.variant, 1, 'the new level starts at T1 V1');
});

test('AND-of-OR unlock (S58 needs one of S56/S8 and one of S26/S32/S33/S28)', () => {
  const A = fullAvail(), st = newState(G);
  for (const s of Object.keys(st.skills)) st.skills[s].status = 'done';
  st.skills.S58.status = 'locked'; st.skills.S56.status = 'open'; st.skills.S8.status = 'open';
  st.skills.S56.level = 4; st.skills.S56.rightStreak = 1;
  // S56 and S8 not done yet: with S56 done the first group is satisfied (S8 is an alternative)
  const a = address(G, A, st, 'S56', 'hotseat');
  const r = applyAnswer(G, st, 'S56', a.type, true);
  assert.equal(st.skills.S58.status, 'open');
  assert.ok(r.transitions.some((t) => t.kind === 'unlock' && t.skill === 'S58'));
});

test('real S1 bank: skipped types never served, hot seat avoids practice-only types, S2 is coming soon', () => {
  const A = buildAvail(bank.map((q) => ({ skill: q.skill, level: q.level, type: q.type, difficulty: q.difficulty, variant: q.variant })));
  const st = newState(G);
  const served = new Set();
  for (let i = 0; i < 200 && st.skills.S1.status !== 'done'; i++) {
    const a = address(G, A, st, 'S1', 'hotseat');
    served.add(a.type);
    assert.ok(!['path2', 'sort', 'guess', 'path', 'cover'].includes(a.type));
    assert.ok(typesDoc.types.find((t) => t.key === a.type).modes.includes('hotseat'), a.type + ' is hot seat');
    applyAnswer(G, st, 'S1', a.type, i % 3 !== 0);
  }
  assert.equal(st.skills.S1.status, 'done');
  const v = view(G, A, st);
  assert.equal(v.active, null);
  assert.ok(v.comingSoon.includes('S2'));
  assert.ok(served.size >= 4);
});

test('upgradeState follows a new graph but keeps earned progress', async () => {
  const { upgradeState, ladderFor } = await import('../server/engine.js');
  const A = fullAvail(), st = newState(G);
  // finish S1, start S2 (one answer), leave S3 untouched
  const play = (id, ok) => { const a = address(G, A, st, id, 'hotseat'); applyAnswer(G, st, id, a.type, ok); };
  while (st.skills.S1.status !== 'done') play('S1', true);
  play('S2', false);
  const g2 = structuredClone(graph);
  for (const id of ['S2', 'S3']) g2.skills.find((s) => s.id === id).req = [['S1'], ['S10']];
  g2.skills.find((s) => s.id === 'S5').rmax = 1;
  g2.skills = g2.skills.filter((s) => s.id !== 'S12');
  g2.skills.push({ id: 'S99', name: 'New', group: 'G1', cp: 'C1', req: [['S1']] });
  const G2 = compileGraph(g2, typesDoc);
  st.skills.S5.r = 2;
  upgradeState(G2, st);
  assert.equal(st.skills.S1.status, 'done');
  assert.equal(st.skills.S2.status, 'open', 'started skill stays open');
  assert.equal(st.skills.S3.status, 'locked', 'untouched skill re-locked');
  assert.equal(st.skills.S99.status, 'open', 'new skill with met prerequisites opens');
  assert.equal(st.skills.S5.r, 1, 'R clamped to the new rmax');
  assert.deepEqual(applyAnswer(G2, st, 'S12', 'mcq', true).transitions, [], 'removed skill is ignored');
  assert.equal(JSON.stringify(upgradeState(G2, structuredClone(st))), JSON.stringify(st), 'idempotent');
  assert.deepEqual(ladderFor(14), [10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 1e5, 1e6, 5e6, 1e7, 3e7, 7e7]);
  for (const n of [3, 10, 15, 21, 22, 40]) {
    const l = ladderFor(n);
    assert.equal(l.length, n + 1);
    assert.equal(l[0], 10); assert.equal(l[n], 7e7);
    assert.ok(l.every((v, i) => !i || v > l[i - 1]), 'strictly rising ' + n);
  }
});

test('levelTrack matches what applyAnswer really does, step by step', async () => {
  const { levelTrack } = await import('../server/engine.js');
  const A = fullAvail();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const id of ['S1', 'S2', 'S7', 'S20']) {   // rmax 1, 2, 3, 3
    const S = G.skills[G.idx[id]];
    const st = newState(G); st.skills[id].status = 'open';
    for (let step = 0; step < 200 && st.skills[id].status === 'open'; step++) {
      const sk = st.skills[id], t = levelTrack(S, sk);
      // remaining: that many right answers in a row (and not one fewer) end this level
      const sim = clone(st); let n = 0;
      while (sim.skills[id].level === sk.level && sim.skills[id].status === 'open') {
        const a = address(G, A, sim, id, 'hotseat'); applyAnswer(G, sim, id, a.type, true); n++;
        assert.ok(n <= 10, 'runaway');
      }
      assert.equal(n, t.remaining, `${id} L${sk.level} R${sk.r} streak ${sk.rightStreak}`);
      assert.equal(t.climb.length + t.need - t.streak, t.remaining);
      assert.deepEqual(t.next, sk.level < 4 ? { level: sk.level + 1, name: ['', 'Recognise', 'Reason', 'Repair', 'Create'][sk.level + 1] } : { skillDone: true });
      // onMiss: a miss here drops to R1 exactly when the track says so
      const miss = clone(st), a0 = address(G, A, miss, id, 'hotseat');
      const res = applyAnswer(G, miss, id, a0.type, false);
      assert.equal(res.transitions.some((x) => x.kind === 'r_drop'), t.onMiss === 'drop_r1');
      // then play on with a random answer
      const a = address(G, A, st, id, 'hotseat'); applyAnswer(G, st, id, a.type, rnd() < 0.65);
    }
    assert.equal(levelTrack(S, { ...st.skills[id], status: 'done' }), null);
  }
});
