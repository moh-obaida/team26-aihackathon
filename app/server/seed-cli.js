import { openDb } from './db.js';
import { seed } from './seed.js';
const path = process.env.DB_PATH || new URL('../data/team26.db', import.meta.url).pathname;
import fs from 'node:fs';
fs.mkdirSync(new URL('../data', import.meta.url).pathname, { recursive: true });
const db = openDb(path);
seed(db);
console.log('Seeded demo data into', path);
