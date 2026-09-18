import koffi from 'koffi';
import os from 'node:os';
import { planCpuSets, cpuLoads } from './cpu-plan.js';

export function openCpuApi() {
  const dll = koffi.load('kernel32.dll');
  const open = dll.func('void * __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)');
  const close = dll.func('bool __stdcall CloseHandle(void *handle)');
  const query = dll.func('bool __stdcall GetSystemCpuSetInformation(void *data, uint32 size, void *length, void *process, uint32 flags)');
  const get = dll.func('bool __stdcall GetProcessDefaultCpuSets(void *process, void *ids, uint32 count, void *required)');
  const set = dll.func('bool __stdcall SetProcessDefaultCpuSets(void *process, void *ids, uint32 count)');
  const same = (a, b) => [...a].sort((x, y) => x - y).join(',') === [...b].sort((x, y) => x - y).join(',');
  function read(handle) {
    const data = Buffer.alloc(4096), count = Buffer.alloc(4);
    if (!get(handle, data, 1024, count) || count.readUInt32LE() > 1024) throw new Error('CPU set query failed');
    return Array.from({ length: count.readUInt32LE() }, (_, i) => data.readUInt32LE(i * 4));
  }
  function write(handle, ids) {
    const data = Buffer.alloc(ids.length * 4);
    ids.forEach((id, i) => data.writeUInt32LE(id, i * 4));
    if (!set(handle, ids.length ? data : null, ids.length)) throw new Error('CPU set assignment failed');
    if (!same(read(handle), ids)) throw new Error('CPU set verification failed');
  }
  return {
    attach(pid) {
      // Query/set limited information only; never request access to unrelated processes.
      const handle = open(0x1000 | 0x2000, false, pid);
      if (!handle) throw new Error('Cannot open app process');
      let original;
      try { original = read(handle); } catch (e) { close(handle); throw e; }
      let assigned = null;
      return {
        topology() {
          const length = Buffer.alloc(4);
          query(null, 0, length, handle, 0);
          const size = length.readUInt32LE();
          if (!size || size > 1024 * 1024) throw new Error('Invalid CPU topology size');
          const data = Buffer.alloc(size);
          if (!query(data, size, length, handle, 0)) throw new Error('CPU topology unavailable');
          const sets = [];
          for (let offset = 0; offset < length.readUInt32LE();) {
            const n = data.readUInt32LE(offset);
            if (n < 32 || offset + n > data.length) throw new Error('Invalid CPU topology record');
            if (data.readUInt32LE(offset + 4) === 0) {
              const flags = data[offset + 19];
              sets.push({ id: data.readUInt32LE(offset + 8), group: data.readUInt16LE(offset + 12),
                logical: data[offset + 14], core: data[offset + 15], numa: data[offset + 17],
                efficiency: data[offset + 18], parked: !!(flags & 1), allocated: !!(flags & 2), owned: !!(flags & 4) });
            }
            offset += n;
          }
          return sets;
        },
        assign(ids) {
          // Preserve explicit settings from external tuning tools.
          if (original.length || !same(read(handle), assigned || original)) throw new Error('External CPU policy retained');
          const previous = assigned;
          try { write(handle, ids); assigned = ids.slice(); }
          catch (e) { write(handle, previous || original); throw e; }
        },
        read: () => read(handle),
        close() {
          try { if (assigned && same(read(handle), assigned)) write(handle, original); }
          finally { close(handle); }
        },
      };
    },
  };
}

export function createCpuBalancer({ getRendererPid, report = () => {} }) {
  let api, main, renderer, pid, timer, previous = os.cpus();
  let enabled = true, active = false, lastMove = 0, lastPlan = null;
  function release() {
    for (const target of [renderer, main]) {
      try { target?.close(); } catch (e) { console.warn('[cpu]', e.message); }
    }
    renderer = main = null; pid = null; lastPlan = null;
  }
  function tick() {
    const current = os.cpus(), loads = cpuLoads(previous, current);
    previous = current;
    if (!enabled || !active) { release(); report('系统调度'); return; }
    try {
      const nextPid = getRendererPid();
      if (!nextPid) return;
      if (pid !== nextPid) {
        release();
        api ||= openCpuApi();
        main = api.attach(process.pid);
        renderer = api.attach(nextPid);
        pid = nextPid;
      }
      const sets = renderer.topology();
      const plan = planCpuSets(sets, loads);
      if (!plan) { release(); report('系统调度（拓扑保守回退）'); return; }
      // Rebalance at most once a minute, and only for a substantial load benefit.
      const cost = ids => ids.reduce((sum, id) => sum + (loads[sets.find(s => s.id === id)?.logical] ?? 0.5), 0) / ids.length;
      const valid = lastPlan && [...lastPlan.render, ...lastPlan.main].every(id => sets.some(s => s.id === id && !s.parked && (!s.allocated || s.owned)));
      if (valid && (Date.now() - lastMove < 60000 || cost(lastPlan.render) - cost(plan.render) < 0.2)) return;
      renderer.assign(plan.render);
      main.assign(plan.main);
      lastPlan = plan; lastMove = Date.now();
      report(`${new Set(sets.map(s => `${s.group}:${s.core}`)).size} 核 / ${sets.length} 线程 · 渲染池 ${plan.render.length} 线程`);
    } catch (e) {
      release(); enabled = false;
      report(`系统调度（${e.message}）`);
    }
  }
  timer = setInterval(tick, 10000);
  return {
    setEnabled(value) { enabled = !!value; tick(); },
    setPopulation(count) { const next = count >= 64; if (next !== active) { active = next; tick(); } },
    dispose() { clearInterval(timer); release(); },
  };
}
