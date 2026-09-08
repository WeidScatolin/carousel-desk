import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const environment = process.env.VERCEL_ENV;

if (environment !== 'production') {
  console.log('[database] Skipping production migrations outside a Vercel production deployment.');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error('[database] DATABASE_URL is required for a production deployment.');
  process.exit(1);
}

console.log('[database] Applying pending production migrations before the application build.');
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('[database] Unable to start Prisma Migrate:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
