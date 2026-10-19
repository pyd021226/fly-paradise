import {canNameColor, normalizeName} from './cabinet-naming.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// 标本收藏：与遇见索引（encounters/）分开独立保存。
//
// 文件结构 schemaVersion 2：
//   { schemaVersion, specimens: [...], ledger: [...] }
//
// 制作账本的三个状态，语义必须严格区分：
//   prepared   事务已登记、还没写标本 —— 崩溃即安全取消，绝不进恢复队列（不能丢活体）
//   committed  标本已持久化、活体还没确认移除 —— 只有这个状态才进恢复移除队列
//   done       活体已移除且 afterSnapshot 已持久化
//
// 关键不变式：
//   * 标本落盘与账本转 committed 必须在同一次写入里完成（原子）
//   * 只有 committed 的事务会被 pendingReconciliations() 交回游戏处理
const FILE = 'specimens.json';
const PNG_PREFIX = 'data:image/png;base64,';
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const PARENT_MODES = new Set(['pair', 'clone']);
const LEDGER_STATES = new Set(['prepared', 'committed', 'done']);

function text(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function optionalString(value, max) {
  return value === null || value === undefined || (typeof value === 'string' && value.length <= max);
}

function optionalAllele(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0 && value <= 2);
}

function readImage(dataUrl) {
  if (!text(dataUrl, MAX_IMAGE_CHARS + PNG_PREFIX.length) || !dataUrl.startsWith(PNG_PREFIX)) {
    throw Error('标本图片无效');
  }
  const raw = dataUrl.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw Error('标本图片编码无效');
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length < 24 || bytes.length > MAX_IMAGE_BYTES) throw Error('标本图片过大或过小');
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('标本不是有效 PNG');
  return bytes;
}

function validateParent(parent) {
  if (parent === null || parent === undefined) return;
  if (typeof parent !== 'object') throw Error('亲本资料无效');
  if (parent.sex !== null && parent.sex !== undefined && !['m', 'f'].includes(parent.sex)) throw Error('亲本性别无效');
  if (!optionalString(parent.color, 40)) throw Error('亲本体色无效');
  if (!optionalString(parent.codon, 64)) throw Error('亲本基因码无效');
  if (!optionalString(parent.geno, 16)) throw Error('亲本基因型无效');
  if (!optionalAllele(parent.geneD) || !optionalAllele(parent.geneP)) throw Error('亲本等位基因无效');
  if (parent.genoVerified !== undefined && typeof parent.genoVerified !== 'boolean') throw Error('亲本基因核实标记无效');
}

function validateParents(parents) {
  if (parents === null || parents === undefined) return;
  if (typeof parents !== 'object' || !PARENT_MODES.has(parents.mode)) throw Error('亲本资料无效');
  validateParent(parents.mother);
  validateParent(parents.father);
  if (parents.mode === 'clone' && parents.father !== null && parents.father !== undefined) {
    throw Error('孤雌个体不应有父本');
  }
}

function validate(specimen) {
  if (!specimen || typeof specimen !== 'object') throw Error('标本资料无效');
  if (!text(specimen.runId, 128)) throw Error('标本世代编号无效');
  if (!text(specimen.originId, 256)) throw Error('标本来源身份无效');
  if (!text(specimen.captureId, 256)) throw Error('标本入瓶身份无效');
  if (!['f', 'm'].includes(specimen.sex)) throw Error('标本性别无效');
  if (!text(specimen.color, 40)) throw Error('标本体色无效');
  if (!['manual', 'capture-snapshot'].includes(specimen.source)) throw Error('标本来源无效');
  if (specimen.source === 'capture-snapshot' && (specimen.capturedByNet !== true || !text(specimen.serverId, 128))) throw Error('捕捉快照必须有真实捕网来源与个体身份');
  if (!specimen.appearance || !Number.isFinite(specimen.appearance.seed)
    || !Number.isFinite(specimen.appearance.scale)
    || specimen.appearance.scale <= 0 || specimen.appearance.scale > 10) throw Error('标本外观资料无效');
  if (typeof specimen.image !== 'string') throw Error('标本图片无效');
  if (!optionalString(specimen.codon, 64)) throw Error('标本基因码无效');
  if (!optionalString(specimen.geno, 16)) throw Error('标本基因型无效');
  if (!optionalAllele(specimen.geneD) || !optionalAllele(specimen.geneP)) throw Error('标本等位基因无效');
  if (specimen.genoVerified !== undefined && typeof specimen.genoVerified !== 'boolean') throw Error('标本基因核实标记无效');
  validateParents(specimen.parents);
  if (specimen.name !== undefined && (normalizeName(specimen.name) !== specimen.name || (specimen.name && !canNameColor(specimen.color)))) {
    throw Error('标本名称无效');
  }
  if (specimen.note !== undefined && (typeof specimen.note !== 'string' || specimen.note.length > 2000)) {
    throw Error('备注最多 2000 字符');
  }
  if (specimen.lifespanMs !== null && specimen.lifespanMs !== undefined
    && (!Number.isFinite(specimen.lifespanMs) || specimen.lifespanMs < 0)) throw Error('生存时长无效');
  if (specimen.lifespanBasis !== undefined && specimen.lifespanBasis !== 'larva-active-real') {
    throw Error('生存计时口径无效');
  }
  readImage(specimen.image);
}

function validateLedger(entry) {
  if (!entry || typeof entry !== 'object') throw Error('制作账本记录无效');
  if (!text(entry.transactionId, 128)) throw Error('制作账本身份无效');
  if (!text(entry.runId, 128) || !text(entry.originId, 256) || !text(entry.captureId, 256)) {
    throw Error('制作账本个体身份无效');
  }
  if (!LEDGER_STATES.has(entry.state)) throw Error('制作账本状态无效');
  if (entry.state === 'prepared' && entry.specimenId !== null && entry.specimenId !== undefined) {
    throw Error('未提交事务不应带标本身份');
  }
  if (entry.state !== 'prepared' && !text(entry.specimenId, 128)) {
    throw Error('已提交事务必须带标本身份');
  }
}

function normalizeData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('版本或结构无效');
  if (data.schemaVersion !== 2 || !Array.isArray(data.specimens) || !Array.isArray(data.ledger)) {
    throw Error('版本或结构无效');
  }
  const ids = new Set();
  const origins = new Set();
  const txs = new Set();
  for (const specimen of data.specimens) {
    validate(specimen);
    if (!text(specimen.specimenId, 128) || !text(specimen.transactionId, 128)
      || !text(specimen.collectedAt, 64) || !Number.isFinite(Date.parse(specimen.collectedAt))) {
      throw Error('标本记录不完整');
    }
    if (ids.has(specimen.specimenId) || origins.has(specimen.originId) || txs.has(specimen.transactionId)) {
      throw Error('重复或损坏记录');
    }
    ids.add(specimen.specimenId);
    origins.add(specimen.originId);
    txs.add(specimen.transactionId);
  }
  const ledgerTxs = new Set();
  for (const entry of data.ledger) {
    validateLedger(entry);
    if (ledgerTxs.has(entry.transactionId)) throw Error('重复制作事务');
    ledgerTxs.add(entry.transactionId);
  }
  return {
    schemaVersion: 2,
    specimens: data.specimens.slice(),
    ledger: data.ledger.map((entry) => ({...entry})),
  };
}

// 旧版（schemaVersion 1，只有 specimens）自动升级，历史收藏不丢。
function migrate(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && data.schemaVersion === 1 && Array.isArray(data.specimens)) {
    return {schemaVersion: 2, specimens: data.specimens, ledger: []};
  }
  return data;
}

export function openCabinet(directory) {
  const dir = path.resolve(directory);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  let state = { schemaVersion: 2, specimens: [], ledger: [] };
  if (fs.existsSync(file)) {
    try {
      state = normalizeData(migrate(JSON.parse(fs.readFileSync(file, 'utf8'))));
    } catch (error) {
      throw Error('标本收藏文件损坏或无法读取，已保留原文件：' + error.message);
    }
  }

  function save(next) {
    const tmp = file + '.' + randomUUID() + '.tmp';
    const fd = fs.openSync(tmp, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(next), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const parsed = normalizeData(JSON.parse(fs.readFileSync(tmp, 'utf8')));
    if (parsed.specimens.length !== next.specimens.length || parsed.ledger.length !== next.ledger.length) {
      throw Error('标本写入校验失败');
    }
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
    fs.renameSync(tmp, file);
    state = next;
  }

  const clone = (specimen) => structuredClone(specimen);
  const ledgerIndex = (transactionId) => state.ledger.findIndex((entry) => entry.transactionId === transactionId);

  function indexOf(specimenId) {
    if (!text(specimenId, 128)) throw Error('标本编号无效');
    const index = state.specimens.findIndex((v) => v.specimenId === specimenId);
    if (index < 0) throw Error('未找到这份标本');
    return index;
  }

  return {
    directory: dir,
    list: () => state.specimens.map(clone),
    count: () => state.specimens.length,
    ledger: () => state.ledger.map((entry) => ({...entry})),
    updateName(specimenId, value) {
      const index = indexOf(specimenId);
      if (!canNameColor(state.specimens[index].color)) throw Error('仅 S 级及以上已收藏标本可以命名');
      const name = normalizeName(value);
      const next = {...state, specimens: state.specimens.slice()};
      next.specimens[index] = {...next.specimens[index], name};
      save(next);
      return clone(next.specimens[index]);
    },
    updateNote(specimenId, note) {
      const index = indexOf(specimenId);
      if (typeof note !== 'string' || note.length > 2000) throw Error('备注无效 最多 2000 字符');
      const next = {...state, specimens: state.specimens.slice()};
      next.specimens[index] = {...next.specimens[index], note};
      save(next);
      return clone(next.specimens[index]);
    },
    // 上架消耗：从展柜移除该记录（活体快照或标本）。
    remove(specimenId) {
      const index = indexOf(specimenId);
      if (index < 0) return false;
      const next = {...state, specimens: state.specimens.slice()};
      next.specimens.splice(index, 1);
      save(next);
      return true;
    },
    // 购买到账：把别人上架的标本导入本机展柜。
    importSpecimen(specimen) {
      const entry = {
        ...structuredClone(specimen),
        specimenId: randomUUID(),
        transactionId: randomUUID(),
        collectedAt: new Date().toISOString(),
        source: 'manual',
        name: null,
        note: '',
      };
      save({...state, specimens: [...state.specimens, entry]});
      return {specimenId: entry.specimenId};
    },
    // 制作开始前登记 prepared：此时还没有标本，崩溃只能安全取消。
    beginTransaction({transactionId, runId, originId, captureId}) {
      if (!text(transactionId, 128)) throw Error('制作事务编号无效');
      if (!text(runId, 128) || !text(originId, 256) || !text(captureId, 256)) throw Error('个体身份无效');
      const existing = ledgerIndex(transactionId);
      if (existing >= 0) {
        const entry = state.ledger[existing];
        if (entry.originId !== originId || entry.captureId !== captureId) throw Error('制作事务已被其它个体占用');
        return {...entry};
      }
      if (state.ledger.some((entry) => entry.originId === originId && entry.state !== 'done')) {
        throw Error('该个体已有未完成的制作事务，请先恢复核对');
      }
      const entry = {transactionId, runId, originId, captureId, state: 'prepared', specimenId: null, startedAt: new Date().toISOString()};
      validateLedger(entry);
      save({...state, ledger: [...state.ledger, entry]});
      return {...entry};
    },
    // 未提交的事务可以安全取消：删掉账本项，绝不触发任何活体移除。
    cancelTransaction(transactionId) {
      const index = ledgerIndex(transactionId);
      if (index < 0) return false;
      if (state.ledger[index].state !== 'prepared') return false;
      const next = {...state, ledger: state.ledger.filter((_, i) => i !== index)};
      save(next);
      return true;
    },
    // 捕捉快照只保存档案，不创建消费账本，不移除活体。
    collectSnapshot({specimen}) {
      validate(specimen);
      if (specimen.source !== 'capture-snapshot') throw Error('捕捉快照来源无效');
      const already = state.specimens.find(entry => entry.originId === specimen.originId);
      if (already) {
        if (already.source !== 'capture-snapshot') throw Error('该个体已被制作成标本');
        return {specimenId: already.specimenId, alreadyCommitted: true};
      }
      const entry = {...structuredClone(specimen), specimenId: randomUUID(), transactionId: randomUUID(), collectedAt: new Date().toISOString()};
      save({...state, specimens: [...state.specimens, entry]});
      return {specimenId: entry.specimenId, alreadyCommitted: false};
    },
    // 标本落盘 + 账本转 committed，必须在同一次写入里完成。
    commit({transactionId, originId, specimen}) {
      validate(specimen);
      if (specimen.source !== 'manual') throw Error('捕捉快照不能进入消费事务');
      if (!text(transactionId, 128) || originId !== specimen.originId) throw Error('标本身份无效');
      const already = state.specimens.find((v) => v.originId === originId);
      if (already) {
        const index = ledgerIndex(transactionId);
        if (index >= 0 && state.ledger[index].state === 'prepared') {
          const next = {...state, ledger: state.ledger.slice()};
          next.ledger[index] = {...next.ledger[index], state: 'committed', specimenId: already.specimenId};
          save(next);
        }
        return {specimenId: already.specimenId, alreadyCommitted: true};
      }
      if (state.specimens.some((v) => v.transactionId === transactionId)) throw Error('制作事务已用于另一个体');
      const entry = {
        ...structuredClone(specimen),
        specimenId: randomUUID(),
        transactionId,
        collectedAt: new Date().toISOString(),
      };
      const next = {...state, specimens: [...state.specimens, entry], ledger: state.ledger.slice()};
      const index = ledgerIndex(transactionId);
      if (index >= 0) next.ledger[index] = {...next.ledger[index], state: 'committed', specimenId: entry.specimenId};
      save(next);
      return {specimenId: entry.specimenId, alreadyCommitted: false};
    },
    // 活体移除且 afterSnapshot 已持久化之后才结账。
    finishTransaction(transactionId) {
      const index = ledgerIndex(transactionId);
      if (index < 0) return false;
      const next = {...state, ledger: state.ledger.slice()};
      next.ledger[index] = {...next.ledger[index], state: 'done', resolvedAt: new Date().toISOString()};
      save(next);
      return true;
    },
    // 恢复队列只包含“标本已落盘、活体待移除”的事务。
    pendingReconciliations() {
      return state.ledger
        .filter((entry) => entry.state === 'committed')
        .map((entry) => ({
          transactionId: entry.transactionId,
          runId: entry.runId,
          originId: entry.originId,
          captureId: entry.captureId,
          specimenId: entry.specimenId,
        }));
    },
    consumedOrigins: (runId) => state.specimens.filter((v) => v.runId === runId && v.source === 'manual').map((v) => v.originId),
  };
}
