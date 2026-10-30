import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { present, grade, fifty, normOut } from '../server/grade.js';

const load = (f) => JSON.parse(fs.readFileSync('server/content/' + f, 'utf8')).questions;
const ALL = [...load('bank-S1-full.json'), ...load('upload-bundle.example.json')];
const KEY_FIELDS = ['correct', 'answer', 'expected', 'wrong', 'why', 'sample', 'samples', 'hidden_code', 'results', 'wrong_sets', 'wrong_paths', 'wrong_pairs', 'outputs'];

// The right answer, as the browser would send it (display indexes after the shuffle in present()).
function rightAnswer(q, key) {
  const p = q.payload;
  const inv = (perm, i) => perm.indexOf(i);
  switch (q.type) {
    case 'mcq': case 'explain': case 'happens': case 'problem': case 'input': case 'name': case 'guess':
      return { pick: inv(key.perm, p.options.findIndex((o) => o.correct)) };
    case 'match': return { pairs: p.answer };
    case 'predict': return { text: p.expected };
    case 'hunt': return { picks: p.answer };
    case 'path2': return { path: p.answer };
    case 'timeline': case 'pseudo': return { order: p.answer.map((x) => inv(key.perm, p.items.indexOf(x))) };
    case 'sort': return { order: p.answer.map((x) => inv(key.perm, p.pieces.indexOf(x))) };
    case 'group': return { groups: p.groups };
    case 'same': return { pick: p.answer === 'Same' ? 0 : 1 };
    case 'gap': return { cells: Object.fromEntries(p.rows.map((r) => [r.var, r.kind])) };
    case 'path': return { picks: p.cases.map((c) => c.answer) };
    case 'bug': return { line: p.answer };
    case 'fill': return { text: p.sample, stdout: p.target };
    case 'mystery': case 'fix': case 'write': case 'faded': return { code: p.sample, stdout: p.target };
    case 'grow': return { code: p.sample, stdout: p.tiers.at(-1).expected };
    case 'parsons': { const lines = p.sample.split('\n'); return { order: lines.map((l) => inv(key.perm, p.items.indexOf(l))), stdout: p.target }; }
    case 'golf': return { picks: p.tokens.map((t) => t.choices.find((c) => c !== t.now && !/^["']/.test(c))), stdout: p.target };
    case 'diverge': return { programs: p.samples.map((s) => ({ code: s, stdout: p.target })) };
    case 'cover': return { picks: p.sample, outputs: p.branches.map((b) => b.output) };
  }
}

test('every bank question: the stored answer grades correct, and an empty answer grades wrong', () => {
  const types = new Set();
  for (const q of ALL) {
    const { key } = present(q);
    types.add(q.type);
    const g = grade(q, rightAnswer(q, key), key);
    assert.equal(g.correct, true, `${q.id} (${q.type}) should be correct: ${g.why}`);
    assert.equal(grade(q, {}, key).correct, false, `${q.id} empty answer should be wrong`);
  }
  assert.equal(types.size, 29, 'all 29 types covered');
});

test('the client copy carries no answer keys', () => {
  for (const q of ALL) {
    const { client } = present(q);
    const s = JSON.stringify(client.payload);
    for (const k of KEY_FIELDS) if (!(q.type === 'grow' && k === 'expected')) assert.ok(!s.includes(`"${k}":`), `${q.id} leaks ${k}`);
    if (['mcq', 'explain', 'happens', 'problem', 'input', 'name'].includes(q.type)) assert.ok(client.payload.options.every((o) => typeof o === 'string'));
  }
});

test('wrong choice returns its own explanation; 50:50 hides two wrong options', () => {
  const q = ALL.find((x) => x.type === 'mcq');
  const { key } = present(q);
  const right = q.payload.options.findIndex((o) => o.correct), wrongI = q.payload.options.findIndex((o) => !o.correct);
  const g = grade(q, { pick: key.perm.indexOf(wrongI) }, key);
  assert.equal(g.correct, false);
  assert.equal(g.why, q.payload.options[wrongI].why);
  const hide = fifty(q, key);
  assert.equal(hide.length, 2);
  assert.ok(!hide.includes(key.perm.indexOf(right)));
});

test('code rules: forbid and require are enforced on run types', () => {
  const q = ALL.find((x) => x.type === 'write');
  const g = grade(q, { code: "print(\"<class 'int'>\")", stdout: q.payload.target });
  assert.equal(g.correct, false);
  assert.equal(normOut('a  \nb\n\n'), 'a\nb');
});
