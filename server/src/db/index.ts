import knex, { Knex } from 'knex';
import config from './knexfile';

export const db: Knex = knex(config);
