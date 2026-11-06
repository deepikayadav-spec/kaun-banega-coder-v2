// Content: the skill graph, the question types and the question bank.
// Uploads are validated against question-types.json and the active skill graph, then upserted by question id.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, one, run, tx, json } from './db.js';
import { compileGraph, buildAvail } from './engine.js';

const CONTENT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'content');
export const readContent = (name) => JSON.parse(fs.readFileSync(path.join(CONTENT, name), 'utf8'));

const ENVELOPE = ['id', 'skill', 'level', 'type', 'difficulty', 'variant', 'task', 'payload'];
const ID_RE = /^C\d+-G\d+-S\d+-L[1-4]-T\d+-R[1-3]-V\d+$/;

// ---------- cache: the compiled graph and what the bank can serve, per serverless instance.
// Every few seconds one small query (the live graph version, and the count and last change of live questions) tells
// whether anything changed; only then is the cache rebuilt, which reads every live question's address (tens of
// thousands of rows). One rebuild at a time: concurrent requests wait for it, or keep using the old cache while it runs.
// A new skill graph or question upload reaches every instance within seconds.
let cache = null, building = null, checked = 0;
export function invalidate() { cache = null; checked = 0; }
const stamp = async () => {
  const g = await one('SELECT version FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
  const q = await one("SELECT COUNT(*)::int AS n, COALESCE(MAX(updated_at), 0) AS t FROM questions WHERE status = 'live'");
  return (g ? g.version : 'file') + '|' + q.n + '|' + q.t;
};
async function build(st) {
  const g = await one('SELECT version, data FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
  const types = await all('SELECT key, data FROM question_types');
  const graph = normalizeGraph(g ? g.data : readContent('skill-graph.json'));
  const typesDoc = types.length ? { ...readContent('question-types.json'), types: sortTypes(types.map((t) => t.data)) } : readContent('question-types.json');
  const rows = await all("SELECT skill, level, type, difficulty, variant FROM questions WHERE status = 'live'");
  return { at: Date.now(), stamp: st, version: g ? g.version : 'file', graph, typesDoc, G: compileGraph(graph, typesDoc), avail: buildAvail(rows), count: rows.length };
}
export async function content() {
  if (cache && Date.now() - checked < 3000) return cache;
  if (!building) building = (async () => {
    try {
      const st = await stamp();
      checked = Date.now();
      if (!cache || cache.stamp !== st) cache = await build(st);
    } finally { building = null; }
  })();
  if (cache) { building.catch(() => {}); return cache; }   // a rebuild is running: carry on with the current cache
  await building;
  return cache;
}
const sortTypes = (list) => list.sort((a, b) => a.level - b.level || Number(a.T.slice(1)) - Number(b.T.slice(1)));

export async function loadQuestion(skill, level, type, difficulty, variant) {
  const r = await one("SELECT data FROM questions WHERE skill = ? AND level = ? AND type = ? AND difficulty = ? AND variant = ? AND status = 'live' LIMIT 1",
    skill, level, type, difficulty, variant);
  return r ? r.data : null;
}
export async function questionById(id) {
  const r = await one('SELECT data FROM questions WHERE id = ?', id);
  return r ? r.data : null;
}

// ---------- validation
export function validateQuestion(q, typesByKey, skillIds) {
  const errs = [];
  for (const k of ENVELOPE) if (q[k] == null) errs.push(`missing ${k}`);
  if (errs.length) return errs;
  if (!ID_RE.test(q.id)) errs.push(`id ${q.id} is not C·G·S·L·T·R·V`);
  const t = typesByKey[q.type];
  if (!t) return [...errs, `unknown type ${q.type}`];
  if (t.level !== q.level) errs.push(`type ${q.type} is level ${t.level}, question says ${q.level}`);
  if (skillIds && !skillIds.has(q.skill)) errs.push(`skill ${q.skill} is not in the skill graph`);
  if (![1, 2, 3].includes(q.difficulty)) errs.push('difficulty must be 1, 2 or 3');
  if (!(q.variant >= 1 && q.variant <= 25)) errs.push('variant must be 1–25');
  for (const k of t.payload.required) if (q.payload[k] == null) errs.push(`payload.${k} is required for ${q.type}`);
  if (Array.isArray(q.payload.options) && ['choice', 'guess'].includes(t.ui) && q.payload.options.filter((o) => o.correct).length !== 1)
    errs.push('exactly one option must be correct');
  return errs;
}

// The skill ids of one checkpoint in the (normalized) skill graph, or null when the graph has no such checkpoint.
export function checkpointSkills(graph, cp) {
  if (!cp || !graph || !graph.checkpoints || !Object.prototype.hasOwnProperty.call(graph.checkpoints, cp)) return null;
  return new Set(graph.skills.filter((s) => s.cp === cp).map((s) => s.id));
}

// bundle: { bank_version, questions: [...] } or a bare array or a single question.
// `checkpoint` (e.g. "C2") limits the upload to that checkpoint of the live skill graph: other questions are rejected.
export async function uploadBank(bundle, { adminId = null, fileName = null, dryRun = false, checkpoint = null } = {}) {
  const { typesDoc, graph } = await content();
  const typesByKey = Object.fromEntries(typesDoc.types.map((t) => [t.key, t]));
  const skillIds = new Set(graph.skills.map((s) => s.id));
  let cpSkills = null;
  if (checkpoint) {
    cpSkills = checkpointSkills(graph, checkpoint);
    if (!cpSkills) return { ok: false, errors: [{ id: null, errors: [`checkpoint ${checkpoint} is not in the live skill graph`] }], counts: {} };
  }
  const cpOfSkill = Object.fromEntries(graph.skills.map((s) => [s.id, s.cp]));
  const list = Array.isArray(bundle) ? bundle : Array.isArray(bundle?.questions) ? bundle.questions : bundle?.id ? [bundle] : null;
  if (!list) return { ok: false, errors: [{ id: null, errors: ['expected { questions: [...] }'] }], counts: {} };
  const errors = [], good = [], seen = new Set();
  for (const q of list) {
    const e = validateQuestion(q, typesByKey, skillIds);
    if (cpSkills && q.skill != null && skillIds.has(q.skill) && !cpSkills.has(q.skill))
      e.push(`skill ${q.skill} is in checkpoint ${cpOfSkill[q.skill] || '?'}, not ${checkpoint}`);
    if (q.id && seen.has(q.id)) e.push('duplicate id in this file');
    seen.add(q.id);
    if (e.length) errors.push({ id: q.id || null, errors: e }); else good.push(q);
  }
  const counts = { received: list.length, valid: good.length, invalid: errors.length, inserted: 0, updated: 0 };
  if (checkpoint) counts.checkpoint = checkpoint;
  if (!dryRun && good.length) {
    const now = Date.now(), bv = bundle.bank_version || null;
    await tx(async () => {
      // many rows per statement: a large bank arrives in parts of a thousand or more questions
      for (let i = 0; i < good.length; i += 200) {
        const part = good.slice(i, i + 200), args = [];
        for (const q of part) args.push(q.id, q.skill, q.level, q.type, q.difficulty, q.variant, q.form || null, q.status || 'live', q.version || 1, bv, json(q), now);
        const rows = await all(`INSERT INTO questions (id, skill, level, type, difficulty, variant, form, status, version, bank_version, data, updated_at)
          VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
          ON CONFLICT (id) DO UPDATE SET skill = excluded.skill, level = excluded.level, type = excluded.type, difficulty = excluded.difficulty,
            variant = excluded.variant, form = excluded.form, status = excluded.status, version = excluded.version,
            bank_version = excluded.bank_version, data = excluded.data, updated_at = excluded.updated_at
          RETURNING (xmax = 0) AS inserted`, ...args);
        for (const r of rows) if (r.inserted) counts.inserted++; else counts.updated++;
      }
      await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
        adminId, fileName, 'bank', json(counts), json(errors.slice(0, 200)), now);
    });
    invalidate();
  }
  return { ok: errors.length === 0, counts, errors };
}

// Replace mode: after every part of a bundle is uploaded, each live question whose id is NOT in the bundle is archived,
// so the bundle becomes the whole live bank. Archived, not deleted: answer history keeps pointing at the question, and
// an open question can still be graded. `keepIds` are all ids in the file (an invalid one keeps its earlier version).
// With `checkpoint`, only that checkpoint's live questions (by skill, in the live skill graph) can be archived.
export async function replaceBank(keepIds, { adminId = null, fileName = null, dryRun = false, checkpoint = null } = {}) {
  const keep = [...new Set((keepIds || []).map(String).filter(Boolean))];
  if (!keep.length) return { ok: false, error: 'The file has no question ids, so nothing would be left live.' };
  let where = "status = 'live' AND id NOT IN (SELECT jsonb_array_elements_text(?::jsonb))";
  const args = [json(keep)];
  if (checkpoint) {
    const cpSkills = checkpointSkills((await content()).graph, checkpoint);
    if (!cpSkills) return { ok: false, error: `Checkpoint ${checkpoint} is not in the live skill graph.` };
    if (!cpSkills.size) return { ok: false, error: `Checkpoint ${checkpoint} has no skills in the live skill graph.` };
    where += ' AND skill IN (SELECT jsonb_array_elements_text(?::jsonb))';
    args.push(json([...cpSkills]));
  }
  const gone = await all(`SELECT skill, COUNT(*)::int AS n FROM questions WHERE ${where} GROUP BY skill ORDER BY skill`, ...args);
  const archived = gone.reduce((a, r) => a + r.n, 0);
  if (!dryRun && archived) {
    const now = Date.now();
    await tx(async () => {
      await run(`UPDATE questions SET status = 'archived', updated_at = ? WHERE ${where}`, now, ...args);
      await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
        adminId, fileName, 'bank_replace', json({ kept: keep.length, archived, ...(checkpoint ? { checkpoint } : {}) }), json([]), now);
    });
    invalidate();
  }
  return { ok: true, archived, bySkill: gone, checkpoint: checkpoint || null };
}

// Graphs come in two shapes: checkpoints as { C1: "name" } with group.cp, or as [{ id, name, groups }] with
// group.checkpoint and an ordered group.skills list. Everything downstream reads the first shape, in path order:
// groups in their listed order, and skills in their group's listed order when the group gives one.
export function normalizeGraph(graph) {
  if (!graph || !Array.isArray(graph.skills) || !Array.isArray(graph.groups)) return graph;
  const list = Array.isArray(graph.checkpoints) ? graph.checkpoints : null;
  const checkpoints = list ? Object.fromEntries(list.filter((c) => c && c.id).map((c) => [c.id, c.name || c.id])) : graph.checkpoints;
  const cpOfGroup = {};
  for (const c of list || []) for (const gid of c.groups || []) cpOfGroup[gid] = c.id;
  const groups = graph.groups.map((g) => {
    const first = graph.skills.find((s) => s.group === g.id);
    return { ...g, cp: g.cp || g.checkpoint || cpOfGroup[g.id] || (first && first.cp) || null };
  });
  const cpOf = Object.fromEntries(groups.map((g) => [g.id, g.cp]));
  const rank = {};
  groups.forEach((g, gi) => (Array.isArray(g.skills) ? g.skills : []).forEach((id, si) => { rank[id] = gi * 1e4 + si; }));
  const gIdx = Object.fromEntries(groups.map((g, i) => [g.id, i]));
  const skills = graph.skills.map((s, i) => ({ ...s, cp: s.cp || cpOf[s.group] || null, _o: rank[s.id] ?? ((gIdx[s.group] ?? 1e3) * 1e4 + 5e3 + i) }))
    .sort((a, b) => a._o - b._o).map(({ _o, ...s }) => s);
  return { ...graph, checkpoints, groups, skills };
}

export function validateGraph(raw) {
  const errs = [], graph = normalizeGraph(raw);
  if (!graph || !Array.isArray(graph.skills) || !Array.isArray(graph.groups)) return ['expected { checkpoints, groups, skills }'];
  if (!graph.skills.length || !graph.groups.length) return ['the graph needs at least one group and one skill'];
  const cps = graph.checkpoints && typeof graph.checkpoints === 'object' ? graph.checkpoints : null;
  const ids = new Set(), gids = new Set();
  for (const g of graph.groups) {
    if (!g.id || !g.name) errs.push(`group ${g.id || '?'}: id and name are required`);
    if (gids.has(g.id)) errs.push(`group ${g.id} appears twice`);
    gids.add(g.id);
    if (cps && g.cp && !(g.cp in cps)) errs.push(`group ${g.id}: unknown checkpoint ${g.cp}`);
  }
  for (const s of graph.skills) {
    if (ids.has(s.id)) errs.push(`skill ${s.id} appears twice`);
    ids.add(s.id);
  }
  const byId = Object.fromEntries(graph.skills.map((s) => [s.id, s]));
  for (const s of graph.skills) {
    if (!s.id || !s.name || !s.group) errs.push(`skill ${s.id || '?'}: id, name and group are required`);
    if (s.group && !gids.has(s.group)) errs.push(`skill ${s.id}: unknown group ${s.group}`);
    if (s.rmax != null && ![1, 2, 3].includes(s.rmax)) errs.push(`skill ${s.id}: rmax must be 1, 2 or 3`);
    if (s.req != null && !(Array.isArray(s.req) && s.req.every(Array.isArray))) { errs.push(`skill ${s.id}: req must be a list of lists`); continue; }
    for (const alts of s.req || []) for (const a of alts) {
      if (a === s.id) errs.push(`skill ${s.id}: requires itself`);
      else if (!ids.has(a)) errs.push(`skill ${s.id}: unknown prerequisite ${a}`);
    }
  }
  // Prerequisite cycles would leave skills locked for ever.
  const state = {};
  const visit = (id, trail) => {
    if (state[id] === 2 || !byId[id]) return;
    if (state[id] === 1) { errs.push(`prerequisite cycle: ${[...trail.slice(trail.indexOf(id)), id].join(' → ')}`); return; }
    state[id] = 1;
    for (const a of (Array.isArray(byId[id].req) ? byId[id].req.flat() : [])) if (a !== id) visit(a, [...trail, id]);
    state[id] = 2;
  };
  for (const s of graph.skills) visit(s.id, []);
  return errs;
}

// What a new graph changes, compared with the live one.
export function diffGraph(before, after) {
  const key = (s) => JSON.stringify((s.req || []).map((a) => [...a].sort()).sort());
  const b = Object.fromEntries((before?.skills || []).map((s) => [s.id, s])), a = Object.fromEntries(after.skills.map((s) => [s.id, s]));
  const d = { added: [], removed: [], reqChanged: [], moved: [], rmaxChanged: [], renamed: [],
    groups: { before: before?.groups?.length || 0, after: after.groups.length } };
  for (const id in a) {
    if (!b[id]) { d.added.push(id); continue; }
    if (key(a[id]) !== key(b[id])) d.reqChanged.push(id);
    if (a[id].group !== b[id].group) d.moved.push(id);
    if ((a[id].rmax || null) !== (b[id].rmax || null)) d.rmaxChanged.push(id);
    if (a[id].name !== b[id].name) d.renamed.push(id);
  }
  for (const id in b) if (!a[id]) d.removed.push(id);
  d.rungs = { before: d.groups.before + 1, after: d.groups.after + 1 };
  return d;
}

// Who a change touches: students with progress on a removed or changed skill, and live questions left without a skill.
async function impact(diff) {
  const touched = [...diff.removed, ...diff.reqChanged, ...diff.moved, ...diff.rmaxChanged];
  let students = 0;
  if (touched.length) {
    const rows = await all('SELECT state FROM engine_state');
    students = rows.filter((r) => touched.some((id) => r.state?.skills?.[id]?.q > 0 || r.state?.skills?.[id]?.status === 'done')).length;
  }
  const orphans = diff.removed.length
    ? (await all("SELECT skill, COUNT(*)::int AS n FROM questions WHERE status = 'live' GROUP BY skill")).filter((r) => diff.removed.includes(r.skill))
    : [];
  return { students, orphanQuestions: orphans.reduce((n, r) => n + r.n, 0), orphanSkills: orphans.map((r) => r.skill) };
}

export async function uploadGraph(graph, { adminId = null, version = null, fileName = null, dryRun = false } = {}) {
  const errs = validateGraph(graph);
  if (errs.length) return { ok: false, errors: errs, error: 'The graph has problems:\n' + errs.slice(0, 40).join('\n') };
  const live = await one('SELECT data FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
  const diff = diffGraph(live && normalizeGraph(live.data), normalizeGraph(graph));
  if (dryRun) return { ok: true, dryRun: true, diff, impact: await impact(diff) };
  const v = version || 'g-' + Date.now();
  await tx(async () => {
    await run('UPDATE skill_graph SET active = 0');
    await run('INSERT INTO skill_graph (version, data, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (version) DO UPDATE SET data = excluded.data, active = 1',
      v, json(graph), Date.now());
    await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
      adminId, fileName || v, 'graph', json({ version: v, skills: graph.skills.length, groups: graph.groups.length, diff }), null, Date.now());
  });
  invalidate();
  return { ok: true, version: v, diff };
}

// Every stored graph, newest first: for the admin's history list and rollback.
export async function graphHistory() {
  const rows = await all('SELECT version, data, active, created_at FROM skill_graph ORDER BY created_at DESC LIMIT 50');
  return rows.map((r) => ({ version: r.version, active: !!r.active, at: r.created_at, skills: r.data.skills.length, groups: r.data.groups.length }));
}

// Make an earlier graph the live one again (rollback).
export async function activateGraph(version, { adminId = null } = {}) {
  const g = await one('SELECT data FROM skill_graph WHERE version = ?', version);
  if (!g) return { ok: false, error: 'No graph with that version.' };
  const live = await one('SELECT data FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
  const diff = diffGraph(live && normalizeGraph(live.data), normalizeGraph(g.data));
  await tx(async () => {
    await run('UPDATE skill_graph SET active = 0');
    await run('UPDATE skill_graph SET active = 1 WHERE version = ?', version);
    await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
      adminId, version, 'graph', json({ version, activated: true, skills: g.data.skills.length, groups: g.data.groups.length, diff }), null, Date.now());
  });
  invalidate();
  return { ok: true, version, diff };
}

export async function uploadTypes(typesDoc) {
  await tx(async () => {
    for (const t of typesDoc.types) await run('INSERT INTO question_types (key, data) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET data = excluded.data', t.key, json(t));
  });
  invalidate();
}

// First boot on an empty database: load the graph, the types and the built-in banks from server/content.
export async function seedIfEmpty() {
  const g = await one('SELECT COUNT(*)::int AS n FROM skill_graph');
  if (!g.n) await uploadGraph(readContent('skill-graph.json'), { version: readContent('skill-graph.json').version || 'skill-graph-2026-10-30' });
  // A new built-in graph (server/content/skill-graph.json with a new "version") goes live once, on the first boot after
  // the deploy that brings it. Graphs uploaded in Admin later are left alone, and Admin can still roll back to any version.
  else {
    const file = readContent('skill-graph.json');
    if (file.version && !(await one('SELECT 1 AS x FROM skill_graph WHERE version = ?', file.version))) {
      const r = await uploadGraph(file, { version: file.version, fileName: 'built-in ' + file.version });
      if (!r.ok) console.error('[graph] built-in graph', file.version, 'not loaded:', r.error);
    }
  }
  const t = await one('SELECT COUNT(*)::int AS n FROM question_types');
  if (!t.n) await uploadTypes(readContent('question-types.json'));
  // Modes added in server/content/question-types.json reach a database seeded earlier (e.g. the L4 types joining the
  // hot seat). Modes are only ever added this way, never removed, so it is safe to run on every boot.
  else {
    const have = Object.fromEntries((await all('SELECT key, data FROM question_types')).map((r) => [r.key, typeof r.data === 'string' ? JSON.parse(r.data) : r.data]));
    let changed = 0;
    for (const f of readContent('question-types.json').types) {
      const d = have[f.key];
      if (!d) continue;
      const add = (f.modes || []).filter((m) => !(d.modes || []).includes(m));
      if (!add.length) continue;
      d.modes = [...(d.modes || []), ...add];
      await run('UPDATE question_types SET data = ? WHERE key = ?', json(d), f.key);
      changed++;
    }
    if (changed) invalidate();
  }
  const q = await one('SELECT COUNT(*)::int AS n FROM questions');
  if (!q.n) {
    await uploadBank(readContent('bank-S1-full.json'), { fileName: 'bank-S1-full.json' });
    await uploadBank(readContent('upload-bundle.example.json'), { fileName: 'upload-bundle.example.json' });
  }
}
