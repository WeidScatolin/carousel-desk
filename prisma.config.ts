import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Client generation (including the render worker's npm ci) does not
    // connect to a database. Database commands still require a real URL.
    url: process.env.DATABASE_URL,
  },
});
