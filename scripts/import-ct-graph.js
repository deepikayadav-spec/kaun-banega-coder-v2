// Turns a "CT Skill Graph" HTML export into server/content/skill-graph.json, the shape the game reads.
//   node scripts/import-ct-graph.js "path/to/CT Skill Graph.html" [version]
// - needs [{ any: [...] }] become req (a list of "any of" lists); checkpoints and group order are taken as given
// - each skill keeps its kps, mistakes, skipped_types and rmax from the current file when it already exists there;
//   a new skill gets rmax from its main prerequisite chain (the KBC Progression Engine rule)
// - "short" is the 1–2 word label shown inside the bubble on My path
// The new file is picked up on the next deploy (see seedIfEmpty in server/bank.js), or upload it in Admin.
import fs from 'node:fs';

const [src, version = 'ct-graph-' + new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!src) { console.error('Usage: node scripts/import-ct-graph.js "CT Skill Graph.html" [version]'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8');
const a = html.indexOf('const D = {'), b = html.indexOf('document.getElementById("facts")', a);
if (a < 0 || b < 0) { console.error('Could not find the graph data (const D = {…}) in that file.'); process.exit(1); }
const D = new Function(html.slice(a, b) + ';return D')();

const OUT = new URL('../server/content/skill-graph.json', import.meta.url);
const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const prev = Object.fromEntries(old.skills.map((s) => [s.id, s]));

// Bubble labels: one or two plain words per skill
const SHORT = {
  S1: 'Data types', S2: 'Strings', S3: 'Lists', S4: 'Variables', S5: 'Type convert', S6: 'Input', S7: 'Split text', S8: 'Indexing',
  S9: 'Length', S10: 'Print', S11: 'Print many', S12: 'Decimals', S13: 'Maths', S14: 'Division', S15: 'Powers', S16: 'Difference',
  S17: 'Rounding', S18: 'Compare', S19: 'And / or', S20: 'Divisibility', S21: 'If-else', S22: 'Elif', S23: 'Special case', S24: 'Flags',
  S25: 'Functions', S26: 'For loops', S27: 'Range end', S28: 'While loops', S29: 'Nested loops', S30: 'Read lines', S31: 'Print lines',
  S32: 'For each', S33: 'Positions', S34: 'Append', S35: 'Running total', S36: 'Counting', S37: 'Best value', S38: 'Tie break',
  S39: 'Not found', S40: 'Stop early', S41: 'Return early', S42: 'Slicing', S43: 'Reverse', S44: 'Positions 1-n', S45: 'Membership',
  S46: 'Max & min', S47: 'Sum', S48: 'Sorting', S49: 'Join text', S50: 'Char types', S51: 'Text methods', S52: 'All pairs',
  S53: 'Sliding', S54: 'Dictionaries', S55: 'Dict lookup', S56: 'Dict store', S57: 'Dict loop', S58: 'Tally', S59: 'Sets', S60: 'Read values'
};

const cpOfGroup = {};
for (const c of D.checkpoints) for (const g of c.groups) cpOfGroup[g] = c.id;
const byId = Object.fromEntries(D.skills.map((s) => [s.id, s]));
const mainOf = (s) => (s.needs || []).map((n) => n.main || n.any[0]).filter(Boolean);
function rmaxOf(s) {
  const seen = new Set(), queue = mainOf(s);
  while (queue.length) { const n = queue.shift(); if (seen.has(n) || !byId[n]) continue; seen.add(n); queue.push(...mainOf(byId[n])); }
  return seen.size >= 3 ? 3 : seen.size >= 1 ? 2 : 1;
}
const skills = D.skills.map((s) => {
  const o = prev[s.id] || {}, cp = s.checkpoint || cpOfGroup[s.group];
  const n = String(s.group).replace(/^G/, ''), k = String(s.id).replace(/^S/, '');
  const out = { id: s.id, address: `${cp}-G${n}-S${k}`, name: s.name, short: SHORT[s.id] || s.name.split(/\s+/).slice(0, 2).join(' '),
    group: s.group, cp, req: (s.needs || []).map((x) => x.any), rmax: o.rmax || rmaxOf(s), check: s.check };
  for (const f of ['kps', 'mistakes', 'skipped_types', 'lesson']) if (o[f] != null) out[f] = o[f];
  return out;
});
const graph = { version, source: D.source || 'CT Skill Graph', checkpoints: D.checkpoints.map((c) => ({ id: c.id, name: c.name, groups: c.groups })),
  groups: D.groups.map((g) => ({ id: g.id, checkpoint: g.checkpoint, name: g.name, skills: g.skills })), skills };
fs.writeFileSync(OUT, JSON.stringify(graph, null, 1) + '\n');
const added = skills.filter((s) => !prev[s.id]).map((s) => s.id), moved = skills.filter((s) => prev[s.id] && prev[s.id].group !== s.group).map((s) => `${s.id} ${prev[s.id].group}→${s.group}`);
console.log(`Wrote ${skills.length} skills in ${graph.groups.length} groups (${version}).`);
console.log('New skills:', added.join(', ') || 'none');
console.log('Moved:', moved.join(', ') || 'none');
