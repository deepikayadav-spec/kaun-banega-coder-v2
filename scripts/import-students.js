// npm run import-students -- students.xlsx [--sync]
import fs from 'node:fs';
import { ready, run, close } from '../server/db.js';
import { parseStudents } from '../server/students.js';
import { universityOf } from '../server/universities.js';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run import-students -- file.xlsx|file.csv'); process.exit(1); }
await ready();
const { rows, errors } = await parseStudents(fs.readFileSync(file), file);
const now = Date.now();
for (const s of rows) {
  await run(`INSERT INTO students_master (roll_no, name, university, batch, email, phone, active, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'file', ?, ?)
    ON CONFLICT (roll_no) DO UPDATE SET name = excluded.name, university = excluded.university, batch = excluded.batch, email = excluded.email, phone = excluded.phone, active = 1, updated_at = excluded.updated_at`,
  s.roll, s.name, s.university || universityOf(s.roll), s.batch, s.email, s.phone, now, now);
}
console.log(`${rows.length} students imported.`, errors.length ? errors : '');
await close();
