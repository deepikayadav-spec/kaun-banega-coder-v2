import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileGraph, buildAvail, newState, activeSkill, address, applyAnswer, view } from '../server/engine.js';

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

test('wrong at L1 on starting R2 drops to R1; two misses on a cell switch type', () => {
  const A = fullAvail(), st = newState(G);
  st.skills.S1.status = 'done'; st.skills.S4.status = 'done'; st.skills.S10.status = 'done';
  st.skills.S2.status = 'open';
  assert.equal(activeSkill(G, A, st).id, 'S2');
  assert.equal(st.skills.S2.r, 2);
  let a = address(G, A, st, 'S2', 'hotseat');
  let r = applyAnswer(G, st, 'S2', a.type, false);
  assert.equal(st.skills.S2.r, 1); assert.equal(r.transitions[0].kind, 'r_drop');
  a = address(G, A, st, 'S2', 'hotseat'); const t0 = a.type;
  applyAnswer(G, st, 'S2', a.type, false);
  assert.equal(address(G, A, st, 'S2', 'hotseat').type, t0, 'one miss: same type, next variant');
  assert.equal(address(G, A, st, 'S2', 'hotseat').variant, 2);
  r = applyAnswer(G, st, 'S2', t0, false);
  assert.equal(r.transitions[0].kind, 'type_switch');
  assert.notEqual(address(G, A, st, 'S2', 'hotseat').type, t0);
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
