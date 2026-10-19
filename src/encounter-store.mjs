import {snapshotHasContent} from './png-content.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 遇见索引：独立于 cabinet.json（标本收藏）的本机持久记录。
// 只记录“实际出现过成虫”的体色；不记录卵、幼虫、蛹，也不因浏览商店产生记录。
const FILE = 'encounters.json';
const IMAGE_DIR = 'encounter-images';
const PNG_PREFIX = 'data:image/png;base64,';
const SOURCES = new Set(['appeared','eclose','purchase','restore','release','unlist','breed','import','unknown']);
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGE_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

function text(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function readImage(dataUrl) {
  if (!text(dataUrl, MAX_IMAGE_CHARS + PNG_PREFIX.length) || !dataUrl.startsWith(PNG_PREFIX)) {
    throw Error('遇见快照不是有效的 PNG 数据');
  }
  const raw = dataUrl.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw Error('遇见快照编码无效');
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length < 24 || bytes.length > MAX_IMAGE_BYTES) throw Error('遇见快照大小无效');
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('遇见快照不是 PNG');
  return bytes;
}

function optionalString(value, max) {
  return value === null || value === undefined || (typeof value === 'string' && value.length <= max);
}

function optionalAllele(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0 && value <= 2);
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') throw Error('遇见记录无效');
  if (!text(record.color, 64)) throw Error('遇见记录体色无效');
  if (!SOURCES.has(record.source)) throw Error('遇见记录来源无效');
  if (!text(record.imageFile, 256) || record.imageFile.includes('/') || record.imageFile.includes('\\')) {
    throw Error('遇见记录快照引用无效');
  }
  if (!text(record.firstSeenAt, 64)) throw Error('遇见记录时间无效');
  if (!Number.isFinite(Date.parse(record.firstSeenAt))) throw Error('遇见记录时间无效');
  if (!optionalString(record.codon, 64)) throw Error('遇见记录基因码无效');
  if (record.sex !== null && record.sex !== undefined && !['m','f'].includes(record.sex)) {
    throw Error('遇见记录性别无效');
  }
  // 基因字段全部可选：旧记录没有这些字段时按“未核实”处理，不算损坏。
  if (!optionalString(record.geno, 16)) throw Error('遇见记录基因型无效');
  if (!optionalAllele(record.geneD) || !optionalAllele(record.geneP)) throw Error('遇见记录等位基因无效');
  if (record.genoVerified !== undefined && typeof record.genoVerified !== 'boolean') {
    throw Error('遇见记录基因核实标记无效');
  }
  // 声称已核实就必须真的带着基因资料，否则视为损坏，避免无来源的“已核实”。
  if (record.genoVerified === true && !text(record.geno, 16) && !(Number.isInteger(record.geneD) && Number.isInteger(record.geneP))) {
    throw Error('标记为已核实却没有基因资料');
  }
}

function normalize(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('版本或结构无效');
  if (data.schemaVersion !== 1 || !Array.isArray(data.records)) throw Error('版本或结构无效');
  for (const key of Object.keys(data)) {
    if (key !== 'schemaVersion' && key !== 'records') throw Error('版本或结构无效');
  }
  const seen = new Set();
  for (const record of data.records) {
    validateRecord(record);
    if (seen.has(record.color)) throw Error('重复体色记录');
    seen.add(record.color);
  }
  return { schemaVersion: 1, records: data.records.slice() };
}

// 损坏文件绝不静默清空：报错并保留原文件。
export function openEncounters(directory) {
  const dir = path.resolve(directory);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  const imageDir = path.join(dir, IMAGE_DIR);
  let data = { schemaVersion: 1, records: [] };
  if (fs.existsSync(file)) {
    try {
      data = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw Error('遇见记录文件损坏或无法读取，已保留原文件：' + error.message);
    }
  }

  // 先落盘、后更新内存：写入失败时内存与磁盘都保留上一次的可用状态。
  function persist(next) {
    fs.mkdirSync(imageDir, { recursive: true });
    const tmp = file + '.' + randomUUID() + '.tmp';
    const fd = fs.openSync(tmp, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(next), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const verify = normalize(JSON.parse(fs.readFileSync(tmp, 'utf8')));
    if (verify.records.length !== next.records.length) throw Error('遇见记录写入校验失败');
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    fs.renameSync(tmp, file);
    data = next;
  }

  function clone(record) {
    return {
      color: record.color,
      source: record.source,
      codon: record.codon ?? null,
      sex: record.sex ?? null,
      // 旧记录缺字段时一律回“未核实/未知”，不补造基因资料。
      geno: record.geno ?? null,
      geneD: record.geneD ?? null,
      geneP: record.geneP ?? null,
      genoVerified: record.genoVerified === true,
      imageFile: record.imageFile,
      firstSeenAt: record.firstSeenAt,
    };
  }

  function needsImageRefresh(color) {
    const record = data.records.find(item => item.color === color);
    if (!record) return false;
    try { return !snapshotHasContent(fs.readFileSync(path.join(imageDir, record.imageFile))); } catch { return true; }
  }

  return {
    directory: dir,
    needsImageRefresh,
    has: (color) => data.records.some((record) => record.color === color),
    count: () => data.records.length,
    list: () => data.records.map(clone),
    record(input) {
      if (!input || typeof input !== 'object') throw Error('遇见记录无效');
      const color = String(input.color ?? '').trim();
      if (!color || color.length > 64) throw Error('体色无效');
      const existing = data.records.find(record => record.color === color);
      if (existing && !needsImageRefresh(color)) return false;
      const bytes = readImage(input.image);
      // Only a real nonblank replacement may repair a historical blank image.
      if (existing && !snapshotHasContent(bytes)) return false;
      const imageFile = randomUUID() + '.png';
      const record = {
        color,
        source: existing ? existing.source : (SOURCES.has(input.source) ? input.source : 'unknown'),
        codon: typeof input.codon === 'string' && input.codon.length <= 64 ? input.codon : null,
        sex: input.sex === 'm' || input.sex === 'f' ? input.sex : null,
        geno: typeof input.geno === 'string' && input.geno.length <= 16 ? input.geno : null,
        geneD: Number.isInteger(input.geneD) && input.geneD >= 0 && input.geneD <= 2 ? input.geneD : null,
        geneP: Number.isInteger(input.geneP) && input.geneP >= 0 && input.geneP <= 2 ? input.geneP : null,
        // 只有调用方明确标记已核实才算真值，默认一律未知。
        genoVerified: input.genoVerified === true,
        imageFile,
        firstSeenAt: existing ? existing.firstSeenAt : new Date().toISOString(),
      };
      validateRecord(record);
      fs.mkdirSync(imageDir, { recursive: true });
      const imagePath = path.join(imageDir, imageFile);
      fs.writeFileSync(imagePath, bytes);
      try {
        persist({ schemaVersion: 1, records: existing ? data.records.map(item => item.color === color ? record : item) : [...data.records, record] });
      } catch (error) {
        // Keep the unreferenced image for recovery; never permanently delete user files.
        throw error;
      }
      return true;
    },
    readImage(imageFile) {
      if (!text(imageFile, 256) || path.basename(imageFile) !== imageFile) throw Error('快照引用无效');
      const full = path.join(imageDir, imageFile);
      if (!fs.existsSync(full)) return null;
      return PNG_PREFIX + fs.readFileSync(full).toString('base64');
    },
  };
}
