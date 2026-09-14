/**
 * Runs every .sql file in supabase/migrations, in filename order, against the
 * Postgres database directly (requires SUPABASE_DB_URL with a real DB password).
 *
 * If you don't want to expose the DB password to this script, skip this and
 * instead paste each migration file into the Supabase SQL Editor manually.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl || dbUrl.includes('[YOUR-DB-PASSWORD]')) {
    console.error(
      'SUPABASE_DB_URL is not set (or still has the placeholder password).\n' +
        'Set it in backend/.env, or run the SQL files in supabase/migrations manually via the Supabase SQL Editor.'
    );
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`Applying migration: ${file}`);
      await client.query(sql);
    }
    console.log('All migrations applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
