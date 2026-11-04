// Postgres everywhere (same pattern as Saturday Sprint).
//   Production (Vercel): DATABASE_URL / POSTGRES_URL → Neon through its connection pooler.
//   Local development:   no URL → PGlite (Postgres compiled to WASM) in data/pglite. Nothing to install.
// All timestamps are epoch milliseconds (BIGINT). Queries use "?" placeholders; they are converted to $1, $2…
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
import { seedUniversities } from './universities.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS universities (
  prefix      TEXT PRIMARY KEY,                -- NIAT ID prefix, e.g. N26P02A
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students_master (
  roll_no     TEXT PRIMARY KEY,                -- NIAT ID: trimmed, upper-case, no spaces
  name        TEXT NOT NULL DEFAULT '',
  university  TEXT NOT NULL DEFAULT '',
  batch       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,      -- 0 = removed from the master list; cannot log in
  source      TEXT NOT NULL DEFAULT 'file',    -- file | admin | test
  created_at  BIGINT,
  updated_at  BIGINT NOT NULL,
  last_login_at BIGINT
);
CREATE INDEX IF NOT EXISTS students_university ON students_master(university);

CREATE TABLE IF NOT EXISTS admins (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin',  -- admin | super_admin
  university    TEXT,                           -- NULL = every university; otherwise the admin sees only this one
  password_hash TEXT NOT NULL,
  must_change_pw INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'active',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  BIGINT,
  created_at    BIGINT NOT NULL,
  last_login_at BIGINT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                    -- student | admin
  subject_id  TEXT NOT NULL,                    -- roll_no or admin id
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_subject ON sessions(kind, subject_id);

-- Content: the skill graph, the question types and the question bank
CREATE TABLE IF NOT EXISTS skill_graph (
  version     TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_types (
  key         TEXT PRIMARY KEY,
  data        JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,                -- C1-G1-S1-L1-T1-R1-V1
  skill        TEXT NOT NULL,
  level        INTEGER NOT NULL,
  type         TEXT NOT NULL,
  difficulty   INTEGER NOT NULL,
  variant      INTEGER NOT NULL,
  form         TEXT,
  status       TEXT NOT NULL DEFAULT 'live',    -- live | draft | archived
  version      INTEGER NOT NULL DEFAULT 1,
  bank_version TEXT,
  data         JSONB NOT NULL,                  -- the full question as uploaded
  updated_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_pick ON questions(skill, level, type, difficulty, status);
CREATE TABLE IF NOT EXISTS bank_uploads (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT,
  file_name   TEXT,
  kind        TEXT NOT NULL,                    -- bank | graph | students
  counts      JSONB,
  errors      JSONB,
  at          BIGINT NOT NULL
);

-- Student progress and history
CREATE TABLE IF NOT EXISTS engine_state (
  roll_no     TEXT PRIMARY KEY,
  state       JSONB NOT NULL,                   -- per-skill progression state (server/engine.js)
  pending     JSONB,                            -- the question currently served and not yet answered
  updated_at  BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id          BIGSERIAL PRIMARY KEY,
  roll_no     TEXT NOT NULL,
  university  TEXT NOT NULL DEFAULT '',
  question_id TEXT NOT NULL,
  skill       TEXT NOT NULL,
  level       INTEGER NOT NULL,
  type        TEXT NOT NULL,
  r           INTEGER NOT NULL,
  variant     INTEGER NOT NULL,
  mode        TEXT NOT NULL,                    -- hotseat | practice
  correct     INTEGER NOT NULL,
  timeout     INTEGER NOT NULL DEFAULT 0,
  answer      JSONB,
  ms          INTEGER,
  lifelines   JSONB,
  at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_roll ON attempts(roll_no, at);
CREATE INDEX IF NOT EXISTS attempts_uni ON attempts(university, at);
CREATE TABLE IF NOT EXISTS transitions (
  id          BIGSERIAL PRIMARY KEY,
  roll_no     TEXT NOT NULL,
  skill       TEXT NOT NULL,
  kind        TEXT NOT NULL,                    -- r_up | r_drop | level_up | type_switch | skill_done | unlock
  detail      JSONB,
  at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS transitions_roll ON transitions(roll_no, at);
CREATE TABLE IF NOT EXISTS game_progress (
  roll_no     TEXT PRIMARY KEY,
  data        JSONB NOT NULL,                   -- the game's wallet, best rung, streaks, buddy …
  coins       BIGINT NOT NULL DEFAULT 0,
  best        INTEGER NOT NULL DEFAULT 0,
  updated_at  BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  roll_no     TEXT NOT NULL,
  kind        TEXT NOT NULL,                    -- run_start | run_end | fff | lifeline | energy | feedback …
  data        JSONB,
  at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_roll ON events(roll_no, at);
CREATE INDEX IF NOT EXISTS events_kind ON events(kind, at);
CREATE TABLE IF NOT EXISTS student_logins (     -- one row per student login (analytics)
  id          BIGSERIAL PRIMARY KEY,
  roll_no     TEXT NOT NULL,
  university  TEXT,
  at          BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS student_logins_at ON student_logins(at);
CREATE INDEX IF NOT EXISTS student_logins_roll ON student_logins(roll_no, at);
CREATE TABLE IF NOT EXISTS activity (            -- visible time with the game open, per student per IST day (analytics)
  roll_no     TEXT NOT NULL,
  day         TEXT NOT NULL,
  ms          BIGINT NOT NULL DEFAULT 0,
  pings       INTEGER NOT NULL DEFAULT 0,
  first_at    BIGINT NOT NULL,
  last_at     BIGINT NOT NULL,
  PRIMARY KEY (roll_no, day)
);
CREATE INDEX IF NOT EXISTS activity_day ON activity(day);
CREATE INDEX IF NOT EXISTS attempts_at ON attempts(at);
CREATE TABLE IF NOT EXISTS app_settings (       -- small key/value switches, e.g. progress_epoch (the last "fresh start")
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presence (           -- who has the game open: a page pings every 30 s
  roll_no     TEXT PRIMARY KEY,
  last_seen   BIGINT NOT NULL
);
ALTER TABLE presence ADD COLUMN IF NOT EXISTS since BIGINT;      -- when this live session began
ALTER TABLE presence ADD COLUMN IF NOT EXISTS screen TEXT;       -- the game screen at the last ping (home, play, path…)
ALTER TABLE presence ADD COLUMN IF NOT EXISTS info JSONB;        -- { practice, answered } for the screen
CREATE TABLE IF NOT EXISTS feedback (
  id          BIGSERIAL PRIMARY KEY,
  roll_no     TEXT,
  text        TEXT NOT NULL,
  ctx         JSONB,
  at          BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_auth (       -- how a student signs in once set up: Google and/or a password, plus a recovery email
  roll_no       TEXT PRIMARY KEY,
  google_sub    TEXT UNIQUE,                     -- Google account id (the id_token 'sub')
  google_email  TEXT,
  password_hash TEXT,                            -- scrypt, like admins
  recovery_email TEXT,
  recovery_verified_at BIGINT,
  updated_at    BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (        -- single-use emailed links (password reset, email check); only the SHA-256 is stored
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                     -- reset | verify_email
  roll_no     TEXT NOT NULL,
  email       TEXT,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  used_at     BIGINT
);
CREATE INDEX IF NOT EXISTS auth_tokens_roll ON auth_tokens(roll_no, kind, created_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      JSONB,
  at          BIGINT NOT NULL
);
`;

// Seeds an empty universities table only: after that, universities are managed in Admin → Settings.
const sq = (x) => "'" + String(x).replace(/'/g, "''") + "'";
const SEED_UNIVERSITIES = `INSERT INTO universities (prefix, name) SELECT v.prefix, v.name FROM (VALUES ${
  seedUniversities().map((u) => `(${sq(u.prefix)}, ${sq(u.name)})`).join(', ')}) AS v(prefix, name)
  WHERE NOT EXISTS (SELECT 1 FROM universities) ON CONFLICT (prefix) DO NOTHING;`;

// ---------- backend
let backend = null;
async function open() {
  if (config.databaseUrl) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // BIGINT → number (ms timestamps fit)
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // NUMERIC (AVG) → number
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(config.databaseUrl) ? false : { rejectUnauthorized: false }
    });
    pool.on('error', (e) => console.error('[db] idle client error', e.message));
    return {
      kind: 'postgres',
      query: async (sql, params, client) => (await (client || pool).query(sql, params)).rows,
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn(c);
          await c.query('COMMIT');
          return r;
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end()
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (!config.pgliteMemory) (await import('node:fs')).mkdirSync(config.dataDir, { recursive: true });
  const lite = await PGlite.create(config.pgliteMemory ? undefined : path.join(config.dataDir, 'pglite'));
  return {
    kind: 'pglite',
    query: async (sql, params, client) => {
      const rows = (await (client || lite).query(sql, params)).rows;
      // match pg: BIGINT and NUMERIC come back as numbers
      for (const r of rows) for (const k in r) if (typeof r[k] === 'bigint') r[k] = Number(r[k]);
      return rows;
    },
    exec: (sql) => lite.exec(sql),
    transaction: (fn) => lite.transaction((tx) => fn(tx)),
    close: () => lite.close()
  };
}

const txStore = new AsyncLocalStorage();
let readyPromise = null;

// Connect and create tables once per process. Safe with many serverless instances (advisory lock).
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      backend = await open();
      if (backend.kind === 'postgres') {
        await backend.transaction(async (c) => {
          await c.query('SELECT pg_advisory_xact_lock(72631002)');
          await c.query(SCHEMA);
          await c.query(SEED_UNIVERSITIES);
        });
      } else {
        await backend.exec(SCHEMA);
        await backend.exec(SEED_UNIVERSITIES);
      }
      return backend;
    })().catch((e) => { readyPromise = null; throw e; });
  }
  return readyPromise;
}

const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); };

export async function query(sql, params = []) {
  const b = backend || (await ready());
  return b.query(toPg(sql), params, txStore.getStore());
}
export const all = (sql, ...p) => query(sql, p);
export const one = async (sql, ...p) => (await query(sql, p))[0];
export const run = (sql, ...p) => query(sql, p);

// Runs fn inside one transaction; every one/all/run called inside it uses the same connection.
export async function tx(fn) {
  if (txStore.getStore()) return fn();
  const b = backend || (await ready());
  return b.transaction((client) => txStore.run(client, fn));
}

export async function close() { if (backend) await backend.close(); backend = null; readyPromise = null; }
export const dbKind = () => (backend ? backend.kind : config.databaseUrl ? 'postgres' : 'pglite');
export const json = (v) => (v == null ? null : JSON.stringify(v));

export async function audit(adminId, action, target, detail) {
  await run('INSERT INTO audit_log (admin_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?)',
    adminId || null, action, target || null, json(detail), Date.now());
}
