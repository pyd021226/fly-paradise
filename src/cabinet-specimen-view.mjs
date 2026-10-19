// 标本个体档案的展示口径：显隐性写法、基因码、提供密码、亲本摘要。
// 与遇见索引共用同一条铁律——只显示真实保存的基因资料，缺失写未知，绝不由体色反推。
import {formatGeno} from './sim-engine.mjs';
import {passwordFor, morphName} from './cabinet-profile.mjs';

export {passwordFor, morphName};

export function sexName(sex) {
  return sex === 'f' ? '雌性' : sex === 'm' ? '雄性' : '未知';
}

export function genotypeOf(record) {
  if (!record) return null;
  if (typeof record.geno === 'string' && record.geno.length > 0) return record.geno;
  const {geneD, geneP} = record;
  if ([0, 1, 2].includes(geneD) && [0, 1, 2].includes(geneP)) return formatGeno(geneD, geneP);
  return null;
}

// 亲本摘要：颜色/性别/显隐性/基因码，缺什么写未知。
export function parentSummary(parent) {
  if (!parent) return null;
  const geno = genotypeOf(parent);
  const codon = typeof parent.codon === 'string' && parent.codon.length > 0 ? parent.codon : null;
  return {
    sex: sexName(parent.sex),
    color: parent.color ? morphName(parent.color) : '未知',
    geno: geno || '未知',
    codon: codon || '未知',
    genoVerified: !!geno,
  };
}

const LIFE_MS = 15 * 60 * 1000;

export function specimenProfile(specimen) {
  const geno = genotypeOf(specimen);
  const codon = typeof specimen.codon === 'string' && specimen.codon.length > 0 ? specimen.codon : null;
  const liveMs = Number.isFinite(specimen.liveMs) && specimen.liveMs >= 0 ? specimen.liveMs : null;
  return {
    color: morphName(specimen.color),
    sex: sexName(specimen.sex),
    geno: geno || '未知',
    codon: codon || '未知',
    password: passwordFor(specimen.color, codon, !!geno) || '未知',
    name: typeof specimen.name === 'string' && specimen.name ? specimen.name : null,
    note: typeof specimen.note === 'string' ? specimen.note : '',
    lifespanMs: liveMs == null ? null : Math.max(0, LIFE_MS - liveMs),
    mates: Number.isInteger(specimen.mates) && specimen.mates >= 0 ? specimen.mates : null,
    mother: parentSummary(specimen.parents && specimen.parents.mother),
    father: specimen.parents && specimen.parents.mode === 'clone' ? null : parentSummary(specimen.parents && specimen.parents.father),
    parentsMode: (specimen.parents && specimen.parents.mode) || null,
  };
}

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '未知';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ' 分 ' + String(s).padStart(2, '0') + ' 秒';
}
