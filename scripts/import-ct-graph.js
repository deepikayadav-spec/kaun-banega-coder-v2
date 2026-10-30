// Turns a "CT Skill Graph" HTML export into server/content/skill-graph.json, the shape the game reads.
//   node scripts/import-ct-graph.js "path/to/CT Skill Graph.html" [version]
// The conversion lives in server/ctgraph.js (Admin → Replace the skill graph accepts the same .html file).
// The new file is picked up on the next deploy (see seedIfEmpty in server/bank.js), or upload it in Admin.
import fs from 'node:fs';
import { extractCtData, ctToGraph } from '../server/ctgraph.js';

const [src, version] = process.argv.slice(2);
if (!src) { console.error('Usage: node scripts/import-ct-graph.js "CT Skill Graph.html" [version]'); process.exit(1); }
const OUT = new URL('../server/content/skill-graph.json', import.meta.url);
const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let graph;
try { graph = ctToGraph(extractCtData(fs.readFileSync(src, 'utf8')), old, version); } catch (e) { console.error(e.message); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(graph, null, 1) + '\n');
const prev = Object.fromEntries(old.skills.map((s) => [s.id, s]));
const added = graph.skills.filter((s) => !prev[s.id]).map((s) => s.id), moved = graph.skills.filter((s) => prev[s.id] && prev[s.id].group !== s.group).map((s) => `${s.id} ${prev[s.id].group}→${s.group}`);
console.log(`Wrote ${graph.skills.length} skills in ${graph.groups.length} groups (${graph.version}).`);
console.log('New skills:', added.join(', ') || 'none');
console.log('Moved:', moved.join(', ') || 'none');
