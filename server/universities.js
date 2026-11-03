// Universities come from the database (table `universities`: NIAT ID prefix → university name), managed in
// Admin → Settings. server/content/universities.json only seeds an empty table on a new install.
// universityOf() fills a student's university from their NIAT ID when a master-list row has none.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = path.join(path.dirname(fileURLToPath(import.meta.url)), 'content', 'universities.json');
export const seedUniversities = () => JSON.parse(fs.readFileSync(SEED, 'utf8')).universities;

// [prefix, name], longest prefix first so the most specific one wins; refreshed from the database (see app.js)
let prefixes = seedUniversities().map((u) => [u.prefix, u.name]);
export function setPrefixes(rows) {
  prefixes = rows.map((r) => [String(r.prefix).toUpperCase(), r.name]).sort((a, b) => b[0].length - a[0].length);
}

export const universityOf = (roll) => {
  const r = String(roll || '').toUpperCase();
  const hit = prefixes.find(([p]) => r.startsWith(p));
  return hit ? hit[1] : '';
};

// Forgiving (Postel's law): spaces, dashes, dots and slashes pasted or typed into a NIAT ID are dropped.
export const normRoll = (r) => String(r || '').trim().toUpperCase().replace(/[\s\-_./\\]+/g, '');
// The usual look-alike slips in the digits after the prefix: the letter O for zero, I or L for one.
// "N26H01AO012" -> "N26H01A0012". Only the tail after the last letter of the prefix is touched.
export const rollLookAlike = (roll) => {
  const m = /^([A-Z]\d+[A-Z]+\d*[A-Z])(.+)$/.exec(roll);
  if (!m) return null;
  const tail = m[2].replace(/O/g, '0').replace(/[IL]/g, '1');
  return tail === m[2] ? null : m[1] + tail;
};
