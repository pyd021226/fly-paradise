// Keep SMT siblings together; load is the mean utilization of a physical core.
export function planCpuSets(sets, loads = []) {
  const available = sets.filter(s => !s.parked && (!s.allocated || s.owned));
  if (new Set(available.map(s => s.group)).size !== 1 || available[0]?.group !== 0 ||
      new Set(available.map(s => s.numa)).size !== 1) return null;
  const cores = new Map();
  for (const s of available) {
    if (!cores.has(s.core)) cores.set(s.core, []);
    cores.get(s.core).push(s);
  }
  if (cores.size < 4) return null;
  const maxClass = Math.max(...available.map(s => s.efficiency), 1);
  const ranked = [...cores.values()].map(cpu => ({
    ids: cpu.map(s => s.id),
    score: cpu.reduce((sum, s) => sum + (loads[s.logical] ?? 0.5), 0) / cpu.length -
      0.35 * cpu[0].efficiency / maxClass,
  })).sort((a, b) => a.score - b.score);
  const count = Math.min(8, Math.max(2, Math.ceil(ranked.length * 0.75)));
  return {
    render: ranked.slice(0, count).flatMap(c => c.ids),
    main: ranked.slice(count, count + 1).flatMap(c => c.ids),
  };
}

export function cpuLoads(previous, current) {
  return current.map((cpu, i) => {
    const old = previous[i]?.times;
    if (!old) return 0.5;
    const total = Object.keys(cpu.times).reduce((n, k) => n + cpu.times[k] - old[k], 0);
    return total > 0 ? Math.max(0, Math.min(1, 1 - (cpu.times.idle - old.idle) / total)) : 0.5;
  });
}
