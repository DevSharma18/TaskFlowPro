import type { Knex } from 'knex';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://taskflow:taskflow@localhost:5432/taskflow_pro';

const config: Knex.Config = {
  client: 'pg',
  connection: databaseUrl,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds'),
    extension: 'ts',
  },
};

export default config;
