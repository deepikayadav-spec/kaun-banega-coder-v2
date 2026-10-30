// Load the skill graph, the question types and the built-in banks; optionally add test students.
//   npm run seed                 → content only (skips what is already there)
//   npm run seed -- --force      → re-upload the built-in banks (upsert by id)
//   npm run seed -- --test       → also add students TEST0001–TEST0005
import { ready, run, close } from '../server/db.js';
import { seedIfEmpty, uploadBank, uploadGraph, uploadTypes, readContent } from '../server/bank.js';

const args = process.argv.slice(2);
await ready();
if (args.includes('--force')) {
  await uploadGraph(readContent('skill-graph.json'), { version: readContent('skill-graph.json').version || 'skill-graph-2026-10-30' });
  await uploadTypes(readContent('question-types.json'));
  for (const f of ['bank-S1-full.json', 'upload-bundle.example.json']) console.log(f, (await uploadBank(readContent(f), { fileName: f })).counts);
} else await seedIfEmpty();
if (args.includes('--test')) {
  const now = Date.now();
  for (let i = 1; i <= 5; i++) {
    await run(`INSERT INTO students_master (roll_no, name, university, source, created_at, updated_at) VALUES (?, ?, 'Test University', 'test', ?, ?)
      ON CONFLICT (roll_no) DO UPDATE SET active = 1`, 'TEST000' + i, 'Test Student ' + i, now, now);
  }
  console.log('Test students TEST0001–TEST0005 (name "Test Student N") added.');
}
console.log('Seed done.');
await close();
