// Settings kept in app_settings and edited in Admin → Settings, so nothing about particular students,
// universities or batches is written into the code.
//   test_rules: which students are test data, left out of analytics and the Hall of Fame:
//     { rollPrefixes: [...], universities: [...], batches: [...] }   (case-insensitive)
import { one, run } from './db.js';

export const DEFAULT_TEST_RULES = { rollPrefixes: ['TEST'], universities: ['Test', 'Test University'], batches: ['TEST'] };
const clean = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 200);

let cache = { at: 0, rules: null };
export async function testRules() {
  if (cache.rules && Date.now() - cache.at < 15000) return cache.rules;
  const r = await one("SELECT value FROM app_settings WHERE key = 'test_rules'");
  let v = DEFAULT_TEST_RULES;
  try { if (r) v = JSON.parse(r.value); } catch { /* keep the default */ }
  cache = { at: Date.now(), rules: { rollPrefixes: clean(v.rollPrefixes), universities: clean(v.universities), batches: clean(v.batches) } };
  return cache.rules;
}
export async function saveTestRules(v) {
  const rules = { rollPrefixes: clean(v && v.rollPrefixes), universities: clean(v && v.universities), batches: clean(v && v.batches) };
  await run("INSERT INTO app_settings (key, value) VALUES ('test_rules', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify(rules));
  cache = { at: Date.now(), rules };
  return rules;
}

// SQL that keeps real students only: `${alias}` is students_master. Returns { sql, args } to AND into a WHERE.
export function realStudentsSql(rules, alias = 'm') {
  const w = [], a = [];
  for (const p of rules.rollPrefixes) { w.push(`UPPER(${alias}.roll_no) NOT LIKE ?`); a.push(p.toUpperCase().replace(/[%_]/g, '') + '%'); }
  if (rules.universities.length) { w.push(`LOWER(COALESCE(${alias}.university, '')) NOT IN (${rules.universities.map(() => '?').join(', ')})`); a.push(...rules.universities.map((u) => u.toLowerCase())); }
  if (rules.batches.length) { w.push(`LOWER(COALESCE(${alias}.batch, '')) NOT IN (${rules.batches.map(() => '?').join(', ')})`); a.push(...rules.batches.map((b) => b.toLowerCase())); }
  return { sql: w.length ? w.join(' AND ') : 'TRUE', args: a };
}
