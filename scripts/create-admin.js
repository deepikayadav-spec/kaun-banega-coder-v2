// npm run create-admin -- --email you@example.com --name "Your Name" [--super] [--university "ALARD - Pune"]
// Prints a temporary password; the admin is asked to change it at first login.
import { ready, run, one, close } from '../server/db.js';
import { hashPassword, tempPassword } from '../server/auth.js';

const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const email = String(arg('--email') || '').trim().toLowerCase();
if (!email) { console.error('Usage: npm run create-admin -- --email you@example.com --name "Name" [--super] [--university "…"]'); process.exit(1); }
await ready();
const first = !(await one('SELECT id FROM admins LIMIT 1'));
const role = a.includes('--super') || first ? 'super_admin' : 'admin';
const pw = arg('--password') || tempPassword();
await run(`INSERT INTO admins (email, name, role, university, password_hash, must_change_pw, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
  ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, university = excluded.university, password_hash = excluded.password_hash, must_change_pw = 1, status = 'active', failed_logins = 0, locked_until = NULL`,
email, arg('--name') || '', role, arg('--university'), hashPassword(pw), Date.now());
console.log(`Admin ${email} (${role}) ready. Temporary password: ${pw}`);
await close();
