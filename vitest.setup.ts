import { config } from 'dotenv';
import '@testing-library/jest-dom/vitest';

config({ path: '.env' });

// Integration suites mutate data. Never use a production .env here.
if (process.env.DATABASE_URL) {
  const database = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || database.pathname !== '/carousel_test') {
    throw new Error('Tests require a disposable local database named carousel_test');
  }
}
