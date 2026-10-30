// "CT Skill Graph" HTML exports → the skill-graph shape the game reads.
// Used by Admin → Replace the skill graph (an .html file) and by scripts/import-ct-graph.js.
// The export carries its data as `const D = { … };` inside a <script>. That object is plain JSON, so it is cut out by
// matching braces and read with JSON.parse: nothing in the uploaded file is ever run.
// - needs [{ any: [...] }] become req (a list of "any of" lists); checkpoints and group order are taken as given
// - starter skills (starter: true) count as done from the start ("the starter skills are done")
// - each skill keeps its kps, mistakes, skipped_types, lesson and rmax from the previous graph when it already exists
//   there; a new skill gets rmax from its main prerequisite chain (the KBC Progression Engine rule)
// - "short" is the 1–2 word label shown inside the bubble on My path

// Bubble labels: one or two plain words per skill
const SHORT = {
  S1: 'Data types', S2: 'Strings', S3: 'Lists', S4: 'Variables', S5: 'Type convert', S6: 'Input', S7: 'Split text', S8: 'Indexing',
  S9: 'Length', S10: 'Print', S11: 'Print many', S12: 'Decimals', S13: 'Maths', S14: 'Division', S15: 'Powers', S16: 'Difference',
  S17: 'Rounding', S18: 'Compare', S19: 'And / or', S20: 'Divisibility', S21: 'If-else', S22: 'Elif', S23: 'Special case', S24: 'Flags',
  S25: 'Functions', S26: 'For loops', S27: 'Range end', S28: 'While loops', S29: 'Nested loops', S30: 'Read lines', S31: 'Print lines',
  S32: 'For each', S33: 'Positions', S34: 'Append', S35: 'Running total', S36: 'Counting', S37: 'Best value', S38: 'Tie break',
  S39: 'Not found', S40: 'Stop early', S41: 'Return early', S42: 'Slicing', S43: 'Reverse', S44: 'Positions 1-n', S45: 'Membership',
  S46: 'Max & min', S47: 'Sum', S48: 'Sorting', S49: 'Join text', S50: 'Char types', S51: 'Text methods', S52: 'All pairs',
  S53: 'Sliding', S54: 'Dictionaries', S55: 'Dict lookup', S56: 'Dict store', S57: 'Dict loop', S58: 'Tally', S59: 'Sets', S60: 'Read values',
  S61: 'Quotient', S62: 'Quotient', S63: 'Text case', S64: 'Find in list'
};

export const looksLikeHtml = (text) => /^\s*</.test(text) || /const\s+D\s*=\s*\{/.test(text);

// The `const D = { … }` object from the export, read as JSON.
export function extractCtData(html) {
  const m = /const\s+D\s*=\s*\{/.exec(String(html || ''));
  if (!m) throw new Error('This HTML is not a CT Skill Graph export: it has no "const D = { … }" data block.');
  const s = html.slice(m.index + m[0].length - 1);
  let depth = 0, i = 0, str = false, esc = false;
  for (; i < s.length; i++) {
    const c = s[i];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  let D;
  try { D = JSON.parse(s.slice(0, i + 1)); } catch (e) { throw new Error('The graph data in this HTML could not be read: ' + e.message); }
  if (!Array.isArray(D.skills) || !Array.isArray(D.groups) || !Array.isArray(D.checkpoints)) throw new Error('The graph data has no skills, groups or checkpoints.');
  return D;
}

// D (from the export) + the graph in use now → the new graph.
export function ctToGraph(D, prevGraph, version) {
  const prev = Object.fromEntries(((prevGraph && prevGraph.skills) || []).map((s) => [s.id, s]));
  const cpOfGroup = {};
  for (const c of D.checkpoints) for (const g of c.groups || []) cpOfGroup[g] = c.id;
  const byId = Object.fromEntries(D.skills.map((s) => [s.id, s]));
  const mainOf = (s) => (s.needs || []).map((n) => n.main || (n.any || [])[0]).filter(Boolean);
  const rmaxOf = (s) => {
    const seen = new Set(), queue = mainOf(s);
    while (queue.length) { const n = queue.shift(); if (seen.has(n) || !byId[n]) continue; seen.add(n); queue.push(...mainOf(byId[n])); }
    return seen.size >= 3 ? 3 : seen.size >= 1 ? 2 : 1;
  };
  const skills = D.skills.map((s) => {
    const o = prev[s.id] || {}, cp = s.checkpoint || cpOfGroup[s.group];
    const n = String(s.group).replace(/^G/, ''), k = String(s.id).replace(/^S/, '');
    const out = { id: s.id, address: `${cp}-G${n}-S${k}`, name: s.name, short: SHORT[s.id] || o.short || s.name.split(/\s+/).slice(0, 2).join(' '),
      group: s.group, cp, req: (s.needs || []).map((x) => x.any || []).filter((a) => a.length), rmax: o.rmax || rmaxOf(s), check: s.check };
    if (s.starter) out.starter = true;
    if (s.foundation) out.foundation = true;
    for (const f of ['kps', 'mistakes', 'skipped_types', 'lesson']) if (o[f] != null) out[f] = o[f];
    return out;
  });
  return {
    version: version || 'ct-graph-' + new Date().toISOString().slice(0, 10), source: D.source || 'CT Skill Graph',
    checkpoints: D.checkpoints.map((c) => ({ id: c.id, name: c.name, groups: c.groups })),
    groups: D.groups.map((g) => ({ id: g.id, checkpoint: g.checkpoint, name: g.name, skills: g.skills })), skills
  };
}
