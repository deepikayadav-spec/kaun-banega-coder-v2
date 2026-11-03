// Settings from the environment. On Vercel they are set in Project → Settings → Environment Variables.
import path from 'node:path';

const env = process.env;
export const config = {
  isVercel: !!env.VERCEL,
  isProd: env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production',
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  dbPoolMax: Number(env.DB_POOL_MAX || 5),
  pgliteMemory: env.PGLITE_MEMORY === 'true',
  dataDir: env.DATA_DIR || path.resolve('data'),
  appSecret: env.APP_SECRET || 'dev-secret-change-me-dev-secret-change-me',
  studentSessionDays: Number(env.STUDENT_SESSION_DAYS || 30),
  adminSessionHours: Number(env.ADMIN_SESSION_HOURS || 12),
  // Students whose NIAT ID starts with TEST may log in without being on the master list (piloting only).
  allowTestLogin: env.ALLOW_TEST_LOGIN === 'true',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : !!env.VERCEL,
  // Student sign-in with Google (OAuth client of type Web application) and emailed links (Google Workspace mailbox over SMTP).
  // PUBLIC_URL is the site address used in the Google redirect and in email links; without it the request's own host is used.
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  smtpHost: env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(env.SMTP_PORT || 465),
  smtpUser: env.SMTP_USER || '',
  smtpPass: env.SMTP_PASS || '',
  mailFrom: env.MAIL_FROM || env.SMTP_USER || '',
  port: Number(env.PORT || 3000)
};
