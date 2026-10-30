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

// ---------- cache: the compiled graph and what the bank can serve. Reloaded after an upload, and every minute
// so that other serverless instances pick up uploads too.
let cache = null;
export function invalidate() { cache = null; }
export async function content() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const g = await one('SELECT version, data FROM skill_graph WHERE active = 1 ORDER BY created_at DESC LIMIT 1');
  const types = await all('SELECT key, data FROM question_types');
  const graph = g ? g.data : readContent('skill-graph.json');
  const typesDoc = types.length ? { ...readContent('question-types.json'), types: sortTypes(types.map((t) => t.data)) } : readContent('question-types.json');
  const rows = await all("SELECT skill, level, type, difficulty, variant FROM questions WHERE status = 'live'");
  cache = { at: Date.now(), version: g ? g.version : 'file', graph, typesDoc, G: compileGraph(graph, typesDoc), avail: buildAvail(rows), count: rows.length };
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

// bundle: { bank_version, questions: [...] } or a bare array or a single question
export async function uploadBank(bundle, { adminId = null, fileName = null, dryRun = false } = {}) {
  const { typesDoc, graph } = await content();
  const typesByKey = Object.fromEntries(typesDoc.types.map((t) => [t.key, t]));
  const skillIds = new Set(graph.skills.map((s) => s.id));
  const list = Array.isArray(bundle) ? bundle : Array.isArray(bundle?.questions) ? bundle.questions : bundle?.id ? [bundle] : null;
  if (!list) return { ok: false, errors: [{ id: null, errors: ['expected { questions: [...] }'] }], counts: {} };
  const errors = [], good = [], seen = new Set();
  for (const q of list) {
    const e = validateQuestion(q, typesByKey, skillIds);
    if (q.id && seen.has(q.id)) e.push('duplicate id in this file');
    seen.add(q.id);
    if (e.length) errors.push({ id: q.id || null, errors: e }); else good.push(q);
  }
  const counts = { received: list.length, valid: good.length, invalid: errors.length, inserted: 0, updated: 0 };
  if (!dryRun && good.length) {
    const now = Date.now(), bv = bundle.bank_version || null;
    await tx(async () => {
      for (const q of good) {
        const prev = await one('SELECT id FROM questions WHERE id = ?', q.id);
        await run(`INSERT INTO questions (id, skill, level, type, difficulty, variant, form, status, version, bank_version, data, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET skill = excluded.skill, level = excluded.level, type = excluded.type, difficulty = excluded.difficulty,
            variant = excluded.variant, form = excluded.form, status = excluded.status, version = excluded.version,
            bank_version = excluded.bank_version, data = excluded.data, updated_at = excluded.updated_at`,
        q.id, q.skill, q.level, q.type, q.difficulty, q.variant, q.form || null, q.status || 'live', q.version || 1, bv, json(q), now);
        if (prev) counts.updated++; else counts.inserted++;
      }
      await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
        adminId, fileName, 'bank', json(counts), json(errors.slice(0, 200)), now);
    });
    invalidate();
  }
  return { ok: errors.length === 0, counts, errors };
}

export function validateGraph(graph) {
  const errs = [];
  if (!graph || !Array.isArray(graph.skills) || !Array.isArray(graph.groups)) return ['expected { checkpoints, groups, skills }'];
  const ids = new Set(graph.skills.map((s) => s.id)), gids = new Set(graph.groups.map((g) => g.id));
  for (const s of graph.skills) {
    if (!s.id || !s.name || !s.group) errs.push(`skill ${s.id || '?'}: id, name and group are required`);
    if (s.group && !gids.has(s.group)) errs.push(`skill ${s.id}: unknown group ${s.group}`);
    for (const alts of s.req || []) for (const a of alts) if (!ids.has(a)) errs.push(`skill ${s.id}: unknown prerequisite ${a}`);
  }
  return errs;
}

export async function uploadGraph(graph, { adminId = null, version = null } = {}) {
  const errs = validateGraph(graph);
  if (errs.length) return { ok: false, errors: errs };
  const v = version || 'g-' + Date.now();
  await tx(async () => {
    await run('UPDATE skill_graph SET active = 0');
    await run('INSERT INTO skill_graph (version, data, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT (version) DO UPDATE SET data = excluded.data, active = 1',
      v, json(graph), Date.now());
    await run('INSERT INTO bank_uploads (admin_id, file_name, kind, counts, errors, at) VALUES (?, ?, ?, ?, ?, ?)',
      adminId, v, 'graph', json({ skills: graph.skills.length, groups: graph.groups.length }), null, Date.now());
  });
  invalidate();
  return { ok: true, version: v };
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
  if (!g.n) await uploadGraph(readContent('skill-graph.json'), { version: 'skill-graph-2026-10-30' });
  const t = await one('SELECT COUNT(*)::int AS n FROM question_types');
  if (!t.n) await uploadTypes(readContent('question-types.json'));
  const q = await one('SELECT COUNT(*)::int AS n FROM questions');
  if (!q.n) {
    await uploadBank(readContent('bank-S1-full.json'), { fileName: 'bank-S1-full.json' });
    await uploadBank(readContent('upload-bundle.example.json'), { fileName: 'upload-bundle.example.json' });
  }
}
