import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flavor = process.argv[2] === 'annoy' ? 'annoy' : 'breed';
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'flavor.json');
writeFileSync(file, `${JSON.stringify({ flavor }, null, 2)}\n`);
