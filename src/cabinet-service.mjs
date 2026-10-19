import {randomUUID} from 'node:crypto';
import {CABINET_REQUESTS, missingFields, PREPARE_RESULT_FIELDS, REMOVE_RESULT_FIELDS} from './cabinet-contract.mjs';

// 本地标本先落盘再消费；服务器个体只保存手动捕捉快照，活体保留。
//
// 已确认边界（不得绕过）：
//   * 任何带非空 serverId 的个体一律禁止制作，包括 UUID 形式；
//     绝不凭编号格式推断“没有服务器背书”；捕网来源已确认时可保存不消费的快照。
//   * prepare 到 remove 之间必须锁定个体：runId / originId / captureId /
//     serverId 以及 snapshot.runId 都要逐一核对。
//   * 未提交（还没有标本）的事务崩溃后只能安全取消，绝不进恢复移除队列。
//   * 只有“标本已落盘、活体待移除”的事务才会在恢复时被交回游戏收尾。
//   * 请求名与字段与游戏 overlay 共用 app/src/cabinet-contract.mjs。

export function eligibleAdult(unit) {
  if (!unit || unit.kind !== 'fly' || unit.dead === true || unit.state === 'dead') return false;
  if (typeof unit.captureId !== 'string' || unit.captureId.length === 0) return false;
  if (typeof unit.originId !== 'string' || unit.originId.length === 0) return false;
  if (typeof unit.runId !== 'string' || unit.runId.length === 0) return false;
  if (typeof unit.serverId === 'string' && unit.serverId.length > 0 && unit.capturedByNet !== true) return false;
  return true;
}

export function isDeadAdult(unit) {
  return !!unit && (unit.dead === true || unit.state === 'dead' || unit.kind !== 'fly');
}

function sameIdentity(left, right) {
  return !!left && !!right
    && left.runId === right.runId
    && left.originId === right.originId
    && left.captureId === right.captureId;
}

// 只认“瓶内活体”：放回桌面后个体仍在 flies 里，不能算瓶内。
function findInJar(snapshot, identity) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.jar)) return null;
  return snapshot.jar.find((unit) => unit
    && unit.originId === identity.originId
    && unit.captureId === identity.captureId) || null;
}

function assertSnapshotIdentity(snapshot, identity, label) {
  if (!snapshot || typeof snapshot !== 'object') throw Error(label + '存档快照无效');
  if (snapshot.v !== 2 || !['jar', 'flies', 'eggs', 'larvae', 'pupae'].every(key => Array.isArray(snapshot[key])) || typeof snapshot.breed !== 'boolean') throw Error(label + '存档快照不完整');
  if (snapshot.runId !== identity.runId) throw Error(label + '存档世代与个体不一致 请刷新后重试');
}

function hasServerId(unit) {
  return typeof unit.serverId === 'string' && unit.serverId.length > 0;
}

function archiveRecord(unit, identity, image, source) {
  return {
    runId: identity.runId,
    originId: identity.originId,
    captureId: identity.captureId,
    sex: unit.sex === 'm' ? 'm' : 'f',
    color: unit.color || 'wild',
    source,
    serverId: source === 'capture-snapshot' ? unit.serverId : null,
    capturedByNet: unit.capturedByNet === true,
    codon: typeof unit.codon === 'string' && unit.codon.length > 0 ? unit.codon : null,
    geno: typeof unit.geno === 'string' && unit.geno.length > 0 ? unit.geno : null,
    geneD: Number.isInteger(unit.gene_d) ? unit.gene_d : null,
    geneP: Number.isInteger(unit.gene_p) ? unit.gene_p : null,
    genoVerified: unit.genoVerified === true,
    appearance: {
      seed: Number.isFinite(unit.seed) ? unit.seed : 0,
      scale: Number.isFinite(unit.scale) && unit.scale > 0 ? unit.scale : 1,
    },
    image,
    parents: unit.parents || null,
    liveMs: Number.isFinite(unit.liveMs) && unit.liveMs >= 0 ? unit.liveMs : null,
    mates: Number.isInteger(unit.mates) && unit.mates >= 0 ? unit.mates : null,
  };
}

export function createCabinetService({store, requestOverlay, persistSnapshot, onCommitted = () => {}}) {
  // 重启后取消尚未产生标本的准备记录，不移除活体。
  for (const entry of store.ledger()) if (entry.state === 'prepared') store.cancelTransaction(entry.transactionId);
  let busy = false;
  const inFlight = new Set();
  const keyOf = (identity) => `${identity.runId}:${identity.originId}:${identity.captureId}`;

  function assertFields(object, fields, label) {
    const missing = missingFields(object, fields);
    if (missing.length) throw Error(label + '回应缺少字段：' + missing.join('、'));
  }

  // 恢复核对：只处理“标本已落盘、活体待移除”的事务。
  async function reconcileOnce(entry) {
    const identity = {runId: entry.runId, originId: entry.originId, captureId: entry.captureId};
    const result = await requestOverlay(CABINET_REQUESTS.RECONCILE, {...identity, transactionId: entry.transactionId});
    assertFields(result, REMOVE_RESULT_FIELDS, '恢复核对');
    if (result.removed !== true) throw Error('游戏未确认该个体已移除');
    assertSnapshotIdentity(result.afterSnapshot, identity, '恢复核对');
    if (findInJar(result.afterSnapshot, identity)) throw Error('恢复核对后该个体仍在瓶内');
    await persistSnapshot(result.afterSnapshot);
    // 只有移除确认 + afterSnapshot 持久化成功之后才结账。
    store.finishTransaction(entry.transactionId);
    return true;
  }

  return {
    get busy() { return busy; },
    async listAdults() {
      if (busy) throw Error('正在制作，请稍候');
      const result = await requestOverlay(CABINET_REQUESTS.LIST, {});
      if (!result || !Array.isArray(result.items)) return [];
      return result.items.filter(eligibleAdult).map(unit => ({...unit, collectionMode: hasServerId(unit) ? 'snapshot' : 'specimen'}));
    },
    async makeSpecimen({captureId} = {}) {
      if (busy) throw Error('正在制作，请勿重复操作');
      if (typeof captureId !== 'string' || !captureId || captureId.length > 256) throw Error('请选择瓶内活成虫');
      busy = true;
      const transactionId = randomUUID();
      let committed = null;
      let snapshotSaved = null;
      let identity = null;
      let ledgerStarted = false;
      try {
        // ① 先锁定并取回成年个体资料（此刻还没有标本，也还没冻结账本）
        const available = await requestOverlay(CABINET_REQUESTS.LIST, {});
        const selected = available?.items?.find(unit => unit.captureId === captureId && eligibleAdult(unit));
        if (!selected) throw Error('该个体已失效 请刷新后重新选择');
        const expected = {runId: selected.runId, originId: selected.originId, captureId};
        const snapshotOnly = hasServerId(selected);
        const prepared = await requestOverlay(CABINET_REQUESTS.PREPARE, {...expected, transactionId, collectionMode: snapshotOnly ? 'snapshot' : 'specimen'});
        assertFields(prepared, PREPARE_RESULT_FIELDS, '制作准备');
        const unit = prepared.adult;
        const image = prepared.image;
        const beforeSnapshot = prepared.beforeSnapshot;
        if (!eligibleAdult(unit) || !sameIdentity(unit, expected)) {
          throw Error('该个体已不再是本次入瓶的活成虫 请刷新后重新选择');
        }
        if ((unit.serverId || null) !== (selected.serverId || null)) throw Error('个体身份已变化 请刷新后重试');
        identity = {runId: unit.runId, originId: unit.originId, captureId: unit.captureId};
        if (inFlight.has(keyOf(identity))) throw Error('该个体正在制作中，请勿重复操作');
        assertSnapshotIdentity(beforeSnapshot, identity, '准备');
        const beforeUnit = findInJar(beforeSnapshot, identity);
        if (!beforeUnit) throw Error('准备快照里找不到这个瓶内个体 请刷新后重新选择');
        if (!sameIdentity(beforeUnit, identity) || (beforeUnit.serverId || null) !== (unit.serverId || null) || (snapshotOnly && beforeUnit.capturedByNet !== true)) {
          throw Error('准备快照里的个体身份不一致 请刷新后重新选择');
        }
        if (isDeadAdult(beforeUnit)) throw Error('该个体已不是活成虫 请刷新后重新选择');
        if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,')) {
          throw Error('无法取得该成虫的外观快照 请刷新后重试');
        }
        inFlight.add(keyOf(identity));
        if (snapshotOnly) {
          await persistSnapshot(beforeSnapshot);
          snapshotSaved = store.collectSnapshot({specimen: archiveRecord(unit, identity, image, 'capture-snapshot')});
          await requestOverlay(CABINET_REQUESTS.ABORT, {transactionId});
          onCommitted(snapshotSaved.specimenId);
          return {ok: true, specimenId: snapshotSaved.specimenId, retainedAlive: true, alreadyCommitted: !!snapshotSaved.alreadyCommitted};
        }
        // ② 登记 prepared（还没有标本）：这一步之后崩溃只能安全取消，不会丢活体
        store.beginTransaction({transactionId, ...identity});
        ledgerStarted = true;
        if (beforeSnapshot) await persistSnapshot(beforeSnapshot);
        // ③ 标本落盘 + 账本转 committed 是同一次原子写入
        committed = store.commit({
          transactionId,
          originId: identity.originId,
          specimen: archiveRecord(unit, identity, image, 'manual'),
        });
        // ④ 提交移除，必须由游戏确认
        const removed = await requestOverlay(CABINET_REQUESTS.COMMIT, {...identity, transactionId});
        assertFields(removed, REMOVE_RESULT_FIELDS, '制作提交');
        if (removed.removed !== true) throw Error('游戏没有确认移除该个体');
        assertSnapshotIdentity(removed.afterSnapshot, identity, '移除后');
        if (findInJar(removed.afterSnapshot, identity)) throw Error('移除后该个体仍在瓶内');
        await persistSnapshot(removed.afterSnapshot);
        // ⑤ 移除确认 + afterSnapshot（若有）已持久化，才结账
        store.finishTransaction(transactionId);
        onCommitted(committed.specimenId);
        return {ok: true, specimenId: committed.specimenId, alreadyCommitted: !!committed.alreadyCommitted};
      } catch (error) {
        if (snapshotSaved) {
          try { await requestOverlay(CABINET_REQUESTS.ABORT, {transactionId}); } catch {}
          onCommitted(snapshotSaved.specimenId);
          return {ok: true, specimenId: snapshotSaved.specimenId, retainedAlive: true, warning: '快照已保存 活体未消费；解除临时锁时未获回应，请重启后核对'};
        }
        if (committed) {
          onCommitted(committed.specimenId);
          return {
            ok: true,
            specimenId: committed.specimenId,
            pendingReconcile: true,
            warning: '标本已保存；瓶内个体将在下次恢复时核对收尾。' + ((error && error.message) || ''),
          };
        }
        if (ledgerStarted) {
          try { store.cancelTransaction(transactionId); } catch { /* 保留 prepared，也不会误删活体 */ }
        }
        try { await requestOverlay(CABINET_REQUESTS.ABORT, {transactionId}); } catch { /* 游戏可能已经退出 */ }
        throw error;
      } finally {
        if (identity) inFlight.delete(keyOf(identity));
        busy = false;
      }
    },
    async reconcile() {
      const pending = store.pendingReconciliations();
      const done = [];
      const failed = [];
      for (const entry of pending) {
        try {
          await reconcileOnce(entry);
          done.push(entry.transactionId);
        } catch (error) {
          failed.push({transactionId: entry.transactionId, reason: (error && error.message) || '核对失败'});
        }
      }
      return {done, failed, pending: store.pendingReconciliations()};
    },
  };
}
