// What the student sees of a question (no answer keys) and how an answer is graded.
// Key-graded types are graded here against the stored key. Run-graded types are run in the student's browser
// (Pyodide); the browser sends the code and what it printed, and the checks on the code itself are done here.

export const RUN_TYPES = new Set(['fill', 'cover', 'mystery', 'parsons', 'golf', 'fix', 'faded', 'grow', 'write', 'diverge']);
export const CHOICE_TYPES = new Set(['mcq', 'explain', 'happens', 'problem', 'input', 'name']);

const shuffle = (a) => {
  const p = a.map((_, i) => i);
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
};
// shuffle, but never leave the list in its stored order when it has more than one item
const mix = (a) => { let p; let n = 0; do { p = shuffle(a); n++; } while (a.length > 1 && n < 10 && p.every((v, i) => v === i)); return p; };

export const normOut = (s) => String(s ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
const normCell = (s) => String(s ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => String(x) === String(b[i]));

// Returns { client, key }: client is sent to the browser, key (shuffle orders) is kept with the pending question.
export function present(q) {
  const p = q.payload || {}, t = q.type, c = {}, key = {};
  if (CHOICE_TYPES.has(t) || t === 'guess') {
    key.perm = mix(p.options);
    c.options = key.perm.map((i) => p.options[i].text);
    if (t === 'explain' && p.printed != null) c.printed = p.printed;
    if (p.spec) c.spec = p.spec;
    if (t === 'guess') {
      c.probe = { var: p.probe.var, min: p.probe.min, max: p.probe.max, hidden: Buffer.from(p.probe.hidden_code).toString('base64') };
      c.max_probes = p.max_probes;
    }
  } else if (t === 'match') {
    c.left = p.left; key.rperm = mix(p.right); c.right = key.rperm.map((i) => p.right[i]);
  } else if (t === 'hunt') c.values = p.values;
  else if (t === 'path2') c.lines = p.lines;
  else if (t === 'timeline' || t === 'pseudo' || t === 'sort' || t === 'parsons') {
    const items = t === 'sort' ? p.pieces : p.items;
    key.perm = mix(items); c.items = key.perm.map((i) => items[i]);
    if (t === 'parsons') c.target = p.target;
  } else if (t === 'group') {
    c.pieces = p.pieces; c.groups = Object.keys(p.groups);
  } else if (t === 'same') {
    c.codeA = p.codeA; c.codeB = p.codeB; c.options = ['Same', 'Different'];
  } else if (t === 'gap') {
    c.rows = p.rows.map((r) => ({ line: r.line, var: r.var, given: !!r.given, kind: r.given ? r.kind : null, value: r.given ? r.value : null }));
    c.kinds = [...new Set(p.rows.map((r) => r.kind))].sort();
  } else if (t === 'path') {
    c.branches = p.branches.map((b) => ({ id: b.id, line: b.line, label: b.label })); c.cases = p.cases.map((x) => ({ input: x.input }));
  } else if (t === 'bug') c.lines = p.lines;
  else if (t === 'fill') c.target = p.target;
  else if (t === 'cover') {
    c.values = p.values; c.need = p.need; c.branches = p.branches.map((b) => ({ id: b.id, line: b.line, output: b.output }));
  } else if (t === 'mystery') c.target = p.target;
  else if (t === 'golf') { c.tokens = p.tokens; c.target = p.target; c.par = p.par; }
  else if (t === 'faded') c.steps = p.steps.map((s) => ({ label: s.label, code: s.code, solved: !!s.solved, hint: s.hint || null }));
  else if (t === 'grow') c.tiers = p.tiers.map((x) => ({ task: x.task, expected: x.expected }));
  else if (t === 'diverge') { c.target = p.target; c.need = p.need; }
  return {
    client: { id: q.id, skill: q.skill, level: q.level, type: q.type, difficulty: q.difficulty, variant: q.variant,
      task: q.task, code: q.code || null, hint: !!q.hint, kps: q.kps || [], mistakes: q.mistakes || [], payload: c },
    key
  };
}

// Rules on the student's code: require (every string), require_any (one of each group), forbid (none).
function codeRules(p, code) {
  const src = String(code || '');
  const miss = (p.require || []).filter((s) => !src.includes(s));
  if (miss.length) return 'Your code must use ' + miss.map((s) => JSON.stringify(s)).join(', ') + '.';
  for (const grp of p.require_any || []) if (!grp.some((s) => src.includes(s))) return 'Your code must use one of ' + grp.map((s) => JSON.stringify(s)).join(' or ') + '.';
  const bad = (p.forbid || []).filter((s) => src.includes(s));
  if (bad.length) return 'Your code must not contain ' + bad.map((s) => JSON.stringify(s)).join(', ') + '.';
  return null;
}

const rebuildGolf = (code, tokens, picks) => {
  const lines = String(code).split('\n');
  tokens.forEach((tk, i) => { const v = picks[i]; if (v != null && v !== tk.now) lines[tk.line] = lines[tk.line].replace(tk.now, v); });
  return lines.join('\n');
};

// Grade an answer. `a` is what the browser sent; `key` is what present() kept.
// Returns { correct, show, why, detail } — show is the right answer in words, why explains this attempt.
export function grade(q, a, key = {}) {
  const p = q.payload || {}, t = q.type, ok = q.ok || '';
  a = a || {};
  const res = (correct, show, why, detail) => ({ correct: !!correct, show: String(show ?? ''), why: correct ? ok : (why || ok), detail });

  if (CHOICE_TYPES.has(t) || t === 'guess') {
    const right = p.options.findIndex((o) => o.correct);
    const pickedStored = key.perm ? key.perm[a.pick] : a.pick;
    const picked = p.options[pickedStored];
    const shown = key.perm ? key.perm.indexOf(right) : right;
    return res(pickedStored === right, p.options[right].text, picked && picked.why ? picked.why : ok, { right: shown });
  }
  switch (t) {
    case 'match': {
      // a.pairs: { leftText: rightText }
      const pairs = a.pairs || {};
      const good = p.left.every((l) => pairs[l] === p.answer[l]);
      return res(good, p.left.map((l) => `${l} → ${p.answer[l]}`).join('\n'), null, { answer: p.answer });
    }
    case 'predict': {
      const got = normOut(a.text), want = normOut(p.expected);
      const why = p.wrong && p.wrong[String(a.text ?? '').trim()];
      return res(got === want, p.expected, why);
    }
    case 'hunt': {
      const got = new Set((a.picks || []).map(String)), want = new Set(p.answer.map(String));
      const good = got.size === want.size && [...want].every((v) => got.has(v));
      let why = null;
      for (const w of p.wrong_sets || []) {
        if (w.if != null && got.has(String(w.if))) { why = w.why; break; }
        if (w.miss != null && !got.has(String(w.miss))) { why = w.why; break; }
      }
      return res(good, p.answer.join(', '), why, { answer: p.answer });
    }
    case 'path2': {
      const good = sameList(a.path, p.answer);
      const w = (p.wrong_paths || []).find((x) => sameList(x.path, a.path));
      return res(good, 'Lines ' + p.answer.join(' → '), w && w.why, { answer: p.answer });
    }
    case 'timeline': case 'pseudo': {
      const order = (a.order || []).map((i) => (key.perm ? p.items[key.perm[i]] : p.items[i]));
      return res(sameList(order, p.answer), p.answer.join('\n'), null, { answer: p.answer });
    }
    case 'sort': {
      const order = (a.order || []).map((i) => (key.perm ? p.pieces[key.perm[i]] : p.pieces[i]));
      let why = null;
      for (const w of p.wrong_pairs || []) { const b = order.indexOf(w.before), f = order.indexOf(w.after); if (b > -1 && f > -1 && b < f) { why = w.why; break; } }
      return res(sameList(order, p.answer), p.answer.map((x) => `${x} = ${p.results[x]}`).join('\n'), why, { answer: p.answer });
    }
    case 'group': {
      // a.groups: { groupName: [pieces] }
      const g = a.groups || {};
      const good = Object.entries(p.groups).every(([name, items]) => {
        const got = (g[name] || []).map(String);
        return got.length === items.length && items.every((x) => got.includes(String(x)));
      });
      return res(good, Object.entries(p.groups).map(([n, it]) => `${n}: ${it.join(', ')}`).join('\n'), null, { answer: p.groups });
    }
    case 'same': {
      const got = String(a.pick === 0 ? 'Same' : a.pick === 1 ? 'Different' : a.text || '');
      return res(got.toLowerCase() === String(p.answer).toLowerCase(), `${p.answer}. A prints ${JSON.stringify(p.outputs[0])}, B prints ${JSON.stringify(p.outputs[1])}.`, null);
    }
    case 'gap': {
      const cells = a.cells || {};
      const rows = p.rows.filter((r) => !r.given);
      const good = rows.every((r) => normCell(cells[r.var]) === normCell(r.kind));
      return res(good, rows.map((r) => `${r.var}: ${r.kind}`).join('\n'), null, { answer: Object.fromEntries(p.rows.map((r) => [r.var, r.kind])) });
    }
    case 'path': {
      const picks = a.picks || [];
      const badCase = p.cases.find((c, i) => picks[i] !== c.answer);
      return res(!badCase, p.cases.map((c) => `${c.input} → ${c.answer}`).join('\n'), badCase && badCase.why, { answer: p.cases.map((c) => c.answer) });
    }
    case 'bug': {
      const line = Number(a.line);
      return res(line === Number(p.answer), `Line ${p.answer}: ${p.lines[p.answer - 1]}`, null, { answer: p.answer });
    }
    // ---------- run-graded: the browser ran the code and reports stdout
    case 'fill': {
      const fillIn = String(a.text ?? '');
      if (!fillIn.trim()) return res(false, p.sample, 'The blank is empty.');
      const rule = codeRules(p, fillIn);
      return res(!rule && normOut(a.stdout) === normOut(p.target), p.sample, rule || (a.error ? 'Python stopped with: ' + a.error : null));
    }
    case 'mystery': case 'fix': case 'write': {
      const rule = codeRules(p, a.code);
      const good = !rule && !a.error && normOut(a.stdout) === normOut(p.target);
      return res(good, p.sample, rule || (a.error ? 'Python stopped with: ' + a.error : `Your code printed ${JSON.stringify(normOut(a.stdout))}, the target is ${JSON.stringify(normOut(p.target))}.`));
    }
    case 'parsons': {
      const order = (a.order || []).map((i) => (key.perm ? p.items[key.perm[i]] : p.items[i]));
      const usesAll = order.length === p.items.length && [...order].sort().join('\n') === [...p.items].sort().join('\n');
      const good = usesAll && !a.error && normOut(a.stdout) === normOut(p.target);
      return res(good, p.sample, !usesAll ? 'Use every line exactly once.' : a.error ? 'Python stopped with: ' + a.error : null);
    }
    case 'golf': {
      const picks = a.picks || [];
      const valid = p.tokens.every((tk, i) => picks[i] == null || tk.choices.includes(picks[i]));
      const edits = p.tokens.filter((tk, i) => picks[i] != null && picks[i] !== tk.now).length;
      const good = valid && !a.error && normOut(a.stdout) === normOut(p.target);
      const best = p.tokens.map((tk) => tk.choices).join(' | ');
      return res(good, `Target ${p.target} in ${p.par} change${p.par === 1 ? '' : 's'}.`, a.error ? 'Python stopped with: ' + a.error : null,
        { edits, par: p.par, code: rebuildGolf(q.code, p.tokens, picks), choices: best });
    }
    case 'faded': {
      const rule = codeRules(p, a.code);
      const good = !rule && !a.error && normOut(a.stdout) === normOut(p.target);
      return res(good, p.sample, rule || (a.error ? 'Python stopped with: ' + a.error : null));
    }
    case 'grow': {
      const rule = codeRules(p, a.code);
      const last = p.tiers[p.tiers.length - 1].expected;
      const good = !rule && !a.error && normOut(a.stdout) === normOut(last);
      return res(good, p.sample, rule || (a.error ? 'Python stopped with: ' + a.error : null));
    }
    case 'diverge': {
      const progs = (a.programs || []).slice(0, 3);
      const seen = new Set();
      let pass = 0;
      for (const pr of progs) {
        const src = String(pr.code || '').trim();
        const key2 = src.replace(/\s+/g, '');
        if (!src || seen.has(key2) || pr.error || normOut(pr.stdout) !== normOut(p.target) || codeRules(p, src)) continue;
        seen.add(key2); pass++;
      }
      return res(pass >= (p.need || 2), p.samples.join('\n'), `${pass} of your programs print ${p.target}; ${p.need || 2} different ones are needed.`, { pass });
    }
    case 'cover': {
      const picks = (a.picks || []).map(String), outs = (a.outputs || []).map(normOut);
      const okPicks = picks.length === p.need && picks.every((v) => p.values.map(String).includes(v)) && new Set(picks).size === picks.length;
      const hit = p.branches.map((b) => outs.filter((o) => o === normOut(b.output)).length);
      const good = okPicks && hit.every((n) => n === 1);
      return res(good, p.sample.join(', '), okPicks ? 'Each branch must run exactly once.' : `Pick ${p.need} different values.`, { hit });
    }
    default:
      return res(false, '', 'This question type is not supported yet.');
  }
}

// 50:50: two wrong options to hide (display indexes).
export function fifty(q, key = {}) {
  const p = q.payload || {};
  if (!Array.isArray(p.options) || p.options.length < 4) return [];
  const right = p.options.findIndex((o) => o.correct);
  const wrong = p.options.map((_, i) => i).filter((i) => i !== right);
  const pick = shuffle(wrong).slice(0, 2).map((i) => wrong[i]);
  return pick.map((i) => (key.perm ? key.perm.indexOf(i) : i));
}
