// Windows 打包入口：安装包（nsis）+ 便携版（portable），两种口味可选。
//
//   node scripts/build.mjs                        # 果蝇乐园：安装包 + 便携版
//   node scripts/build.mjs --flavor annoy         # 果蝇乐园造福版
//   node scripts/build.mjs --flavor breed,annoy   # 两份都打（CI 用这个）
//   node scripts/build.mjs --targets nsis         # 只打安装包
//
// 每次打完都会检查 release/ 里是否真的多出对应文件，并核对 app.asar 里的 flavor.json
// 是否和本次口味一致（防止 flavor 切换失败却打出一个同名错包）。
// 无论成功失败，最后都把 flavor.json 恢复成 breed。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFlavor, writeFlavor } from './set-flavor.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const OUT = join(ROOT, pkg.build.directories.output);
const VERSION = pkg.version;

// artifactName 用 electron-builder 的宏模板，原样透传给 CLI（这里不展开）
const V = '${version}';
const E = '${ext}';

const FLAVORS = {
  breed: { productName: '果蝇乐园', appId: 'com.desktopfly.pet', prefix: 'fly-paradise', unpackDirName: 'fly-paradise-portable' },
  annoy: { productName: '果蝇乐园造福版', appId: 'com.desktopfly.welfare', prefix: 'fly-paradise-welfare', unpackDirName: 'fly-paradise-welfare-portable' },
};
const TARGETS = ['nsis', 'portable'];
const built = [];

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const split = (value) => String(value).split(',').map((s) => s.trim()).filter(Boolean);

const flavors = split(argValue('--flavor', 'breed')).map(normalizeFlavor);
const targets = split(argValue('--targets', TARGETS.join(','))).map((t) => t.toLowerCase());
for (const f of flavors) if (!FLAVORS[f]) throw new Error(`未知口味：${f}`);
for (const t of targets) if (!TARGETS.includes(t)) throw new Error(`未知目标：${t}（可用：${TARGETS.join(', ')}）`);

function builderCli() {
  for (const id of ['electron-builder/out/cli/cli.js', 'electron-builder/cli.js']) {
    try {
      return require.resolve(id);
    } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 electron-builder，请先 npm install');
}

function packagedFlavor() {
  try {
    const { extractFile } = require('@electron/asar');
    const buf = extractFile(join(OUT, 'win-unpacked', 'resources', 'app.asar'), 'flavor.json');
    return JSON.parse(buf.toString('utf8')).flavor;
  } catch {
    return null; // 读不到（asar 缺失/结构变化）就当跳过，不误报失败
  }
}

function verify(flavor, startedAt) {
  const f = FLAVORS[flavor];
  const esc = VERSION.replace(/\./g, '\\.');
  const re = new RegExp(`^${f.prefix}-(setup|portable)-${esc}.*\\.exe$`);
  const matching = readdirSync(OUT).filter((n) => re.test(n));
  // 只认这次构建写出来的文件：release/ 里可能还躺着上一版同名产物，那不能算数
  const found = matching.filter((n) => statSync(join(OUT, n)).mtimeMs >= startedAt - 2000);
  const kinds = new Set(found.map((n) => (n.includes('-portable-') ? 'portable' : 'nsis')));
  for (const t of targets) {
    if (kinds.has(t)) continue;
    const stale = matching.filter((n) => (t === 'portable') === n.includes('-portable-'));
    throw new Error(`${flavor} 这次没产出 ${t} 产物${stale.length ? `（release/ 里只有上次留下的 ${stale.join(', ')}）` : ''}`);
  }
  const inner = packagedFlavor();
  if (inner && inner !== flavor) throw new Error(`app.asar 里是 ${inner}，但本次要打 ${flavor}，flavor.json 没切过去`);
  built.push(...found.map((n) => ({ name: n, flavor })));
  process.stdout.write(`[build] ${flavor} OK：${found.join(', ')}${inner ? '' : '（未校验 asar 口味）'}\n`);
}

function writeSums() {
  const lines = built
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => `${createHash('sha256').update(readFileSync(join(OUT, name))).digest('hex')}  ${name}`);
  writeFileSync(join(OUT, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  process.stdout.write(`\n[build] SHA256SUMS.txt\n${lines.join('\n')}\n`);
}

try {
  for (const flavor of flavors) {
    const f = FLAVORS[flavor];
    writeFlavor(flavor);
    const args = [
      builderCli(), '--win', ...targets, '--x64', '--publish', 'never',
      `-c.productName=${f.productName}`,
      `-c.appId=${f.appId}`,
      `-c.nsis.artifactName=${f.prefix}-setup-${V}.${E}`,
      `-c.portable.artifactName=${f.prefix}-portable-${V}.${E}`,
      `-c.portable.unpackDirName=${f.unpackDirName}`,
    ];
    process.stdout.write(`\n[build] ${flavor} → ${targets.join(' + ')}（v${VERSION}）\n`);
    const startedAt = Date.now();
    const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${flavor} 打包失败（exit ${r.status}）`);
    verify(flavor, startedAt);
  }
  writeSums();
  process.stdout.write(`\n[build] 完成，产物在 ${OUT}\n`);
} finally {
  writeFlavor('breed');
}
