// 把游戏内的“成虫出现”事件合并成每个体色一次的持久记录。
// 契约：observe(fly) 成功或已记录 → resolve true；写盘失败 → resolve false，
// 失败项留在队列里等待重试定时器。绝不把失败静默当成成功（观察器据此排队重试）。
export function createEncounterTracker({ persist, describe, onError = (error) => console.error('遇见记录保存失败', error) }) {
  if (typeof persist !== 'function') throw Error('缺少 persist');
  if (typeof describe !== 'function') throw Error('缺少 describe');
  const seen = new Set();
  const pending = [];
  let pumping = false;
  let inflight = null;

  function wait() {
    if (inflight) return inflight;
    inflight = (async () => {
      // while(pending.length)：队首已经是已收录体色时只跳过它再 continue，
      // 后面的新体色照常写盘；只有写盘成功才出队。
      // 写盘失败就把该项留在队首、直接返回 false。
      // 这里绝不自己安排下一轮重试——重试只由 observer 的定时器驱动，
      // 否则持续失败会变成无限微任务、饿死计时器并卡死页面。
      while (pending.length) {
        const item = pending[0];
        if (seen.has(item.color)) {
          pending.shift();
          continue;
        }
        try {
          await persist(item);
          seen.add(item.color);
          pending.shift();
        } catch (error) {
          try { onError(error, item); } catch { /* 忽略上报失败 */ }
          return false;
        }
      }
      return true;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function observe(fly, source = 'appeared') {
    if (!fly || fly.dead || fly.state === 'dead') return Promise.resolve(false);
    if (fly.kind && fly.kind !== 'fly') return Promise.resolve(false);
    let item;
    try {
      item = describe(fly, source);
    } catch {
      return Promise.resolve(false);
    }
    if (!item || typeof item.color !== 'string' || !item.color) return Promise.resolve(false);
    if (seen.has(item.color)) return Promise.resolve(true);
    if (!pending.some((entry) => entry.color === item.color)) pending.push(item);
    return wait();
  }

  // 启动时把磁盘上已有的体色灌进来，避免重复上报历史上已记录的颜色。
  function hydrate(colors) {
    for (const color of colors || []) {
      if (typeof color === 'string' && color) seen.add(color);
    }
  }

  return { observe, hydrate, seen: (color) => seen.has(color), pending: () => pending.length };
}

// 上报通道包装：只有在 observe 明确 resolve true 时才出队；
// resolve false（写盘失败）或抛错都保留，等待有间隔的定时重试。
// 重试完全由这里的计时器驱动，tracker 内部不会自己空转。
export function createResilientObserver(observe, { retryMs = 1500, maxRetries = 8, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof observe !== 'function') throw Error('缺少 observe');
  const queue = new Map();
  let retryTimer = null;
  let attempts = 0;
  let live = true;

  function schedule() {
    if (!live || retryTimer || queue.size === 0) return;
    if (attempts >= maxRetries) return;
    attempts += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      flush();
    }, retryMs);
    if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
  }

  async function flush() {
    if (!live) return;
    for (const [key, item] of [...queue]) {
      try {
        const stored = await observe(item.fly, item.source);
        if (stored) queue.delete(key);
      } catch (error) {
        try { onError(error, item); } catch { /* 忽略上报失败 */ }
      }
    }
    schedule();
  }

  return {
    report(fly, source) {
      if (!live) return;
      const key = String((fly && fly.color) || 'wild') + '|' + source;
      queue.set(key, { fly, source });
      flush();
    },
    pending: () => queue.size,
    retryAttempts: () => attempts,
    stop() {
      live = false;
      queue.clear();
      if (retryTimer) clearTimer(retryTimer);
      retryTimer = null;
    },
  };
}
