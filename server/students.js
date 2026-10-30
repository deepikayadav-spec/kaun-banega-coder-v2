// Student master list from an Excel (.xlsx) or CSV file. Header names are matched loosely
// (same aliases as Saturday Sprint: "NIAT ID", "User id", "Student Name", "University", …).
import readXlsxFile from 'read-excel-file/node';
import { normRoll } from './universities.js';

const ALIASES = {
  roll: ['niat id', 'niatid', 'niat_id', 'roll no', 'roll number', 'roll_no', 'roll', 'student id', 'id'],
  name: ['name', 'student name', 'full name', 'student'],
  university: ['university', 'campus', 'college', 'university name'],
  batch: ['batch', 'section', 'group'],
  email: ['email', 'email id', 'email ids', 'mail'],
  phone: ['phone', 'phone no', 'phone no.', 'mobile', 'mobile number', 'phone number']
};
const clean = (h) => String(h ?? '').trim().toLowerCase().replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/\.$/, '');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export async function parseStudents(buf, fileName = '') {
  const isXlsx = buf && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // zip = xlsx
  const grid = isXlsx ? await readXlsxFile(buf) : parseCsv(String(buf || '').replace(/^﻿/, ''));
  const errors = [], rows = [];
  if (!grid.length) return { rows, errors: ['empty file'] };
  // find the header row: the first row with a roll-number column
  let hi = grid.findIndex((r) => r.some((c) => ALIASES.roll.includes(clean(c))));
  if (hi < 0) return { rows, errors: ['No NIAT ID column found. Name a column "NIAT ID".'] };
  const head = grid[hi].map(clean), col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.includes(h));
  const seen = new Set();
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i], get = (k) => (col[k] >= 0 && r[col[k]] != null ? String(r[col[k]]).trim() : '');
    const roll = normRoll(get('roll'));
    if (!roll) continue;
    if (seen.has(roll)) { errors.push(`row ${i + 1}: ${roll} appears twice`); continue; }
    seen.add(roll);
    rows.push({ roll, name: get('name'), university: get('university'), batch: get('batch'), email: get('email'), phone: get('phone') });
  }
  return { rows, errors, fileName };
}
