import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'flavor.json');

export function normalizeFlavor(value) {
  return value === 'annoy' ? 'annoy' : 'breed';
}

export function writeFlavor(flavor) {
  // 和仓库里 flavor.json 的既有格式保持一致（单行带空格），免得每次打包都留下无意义的 diff
  writeFileSync(FILE, `{ "flavor": "${normalizeFlavor(flavor)}" }\n`);
}

// 只有直接运行时（node scripts/set-flavor.mjs annoy）才写文件；被 import 时只提供函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFlavor(process.argv[2]);
}
