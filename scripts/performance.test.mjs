import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCpuSets, cpuLoads } from '../src/cpu-plan.js';
import { RenderBudget } from '../renderer/render-budget.js';

const fixture = Array.from({ length: 12 }, (_, i) => ({ id: 256 + i, group: 0,
  logical: i, core: Math.floor(i / 2), numa: 0, efficiency: 0 }));
test('SMT siblings remain together and process pools do not overlap', () => {
  const plan = planCpuSets(fixture, [1,1,0,0,0,0,0,0,0,0,0,0]);
  assert.equal(plan.render.length, 10);
  assert.deepEqual(plan.main, [256, 257]);
  assert.equal(plan.render.some(id => plan.main.includes(id)), false);
  for (let i = 0; i < 12; i += 2) assert.equal(plan.render.includes(256+i), plan.render.includes(257+i));
});
test('heterogeneous cores prefer performance class when equally loaded', () => {
  const sets = fixture.map(s => ({ ...s, efficiency: s.core === 0 ? 1 : 0 }));
  assert.ok(planCpuSets(sets).render.includes(256));
});
test('small and multi-group/NUMA systems defer to OS', () => {
  assert.equal(planCpuSets(fixture.slice(0, 6)), null);
  assert.equal(planCpuSets(fixture.map((s, i) => ({ ...s, group: i > 5 ? 1 : 0 }))), null);
  assert.equal(planCpuSets(fixture.map((s, i) => ({ ...s, numa: i > 5 ? 1 : 0 }))), null);
});
test('reserved and parked processors excluded', () => {
  const sets = fixture.map((s, i) => ({ ...s, allocated: i < 2, parked: i > 9 }));
  const p = planCpuSets(sets);
  assert.ok([...p.render, ...p.main].every(id => id >= 258 && id <= 265));
});
test('utilization comes from interval deltas', () => {
  assert.deepEqual(cpuLoads([{ times: { idle: 10, user: 10 } }], [{ times: { idle: 60, user: 60 } }]), [0.5]);
});
test('sustained pressure reduces high-DPI scale, with cooldown and floor', () => {
  const b = new RenderBudget();
  for (let i=0;i<90;i++) b.sample({ interval: 30, work: 20, population: 192, dpr: 2, now: 10000+i*30, enabled: true });
  assert.equal(b.scale, 0.85);
  for (let i=0;i<90;i++) b.sample({ interval: 30, work: 20, population: 192, dpr: 2, now: 13000+i*10, enabled: true });
  assert.equal(b.scale, 0.85);
  for (let i=0;i<1000;i++) b.sample({ interval: 30, work: 20, population: 192, dpr: 2, now: 20000+i*30, enabled: true });
  assert.equal(b.scale, 0.5);
  b.sample({ interval: 16, work: 5, population: 192, dpr: 2, now: 60000, enabled: false });
  assert.equal(b.scale, 1);
});
test('normal-DPI does not blur and isolated spikes do not change quality', () => {
  const b = new RenderBudget();
  for (let i=0;i<200;i++) b.sample({ interval: 30, work: 25, population: 192, dpr: 1, now: 10000+i*30, enabled: true });
  assert.equal(b.scale, 1);
});
