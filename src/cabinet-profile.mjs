import { formatGeno } from './sim-engine.mjs';

// 遇见索引的个体档案展示口径。只依赖记录里真实保存的基因资料，
// 绝不用体色反推基因型；缺失就写未知。
export const MORPH_NAMES = Object.freeze({
  wild: '褐色', mid: '中褐', deep: '深褐', white: '白色',
  green: '绿色', green2: '亮绿', red: '红色', red2: '亮红',
  yellow: '黄色', yellow2: '亮黄', mut: '更高突变',
});

// 展示口径：普通褐 1、中褐 2、深褐 3、白色 4；突变个体显示基因码最后一位。
const BASE_PASSWORD = Object.freeze({ wild: '1', mid: '2', deep: '3', white: '4' });

export function morphName(color) {
  return MORPH_NAMES[color] || (typeof color === 'string' && color ? color : '未知');
}

// 由真实等位基因数推出显隐性写法：0=aa/bb，1=Aa/Bb，2=AA/BB。
function genoFromAlleles(geneD, geneP) {
  if (![0, 1, 2].includes(geneD) || ![0, 1, 2].includes(geneP)) return null;
  return formatGeno(geneD, geneP);
}

export function deriveProfile(entry) {
  const unknown = { genoVerified: false, geno: null, codon: null };
  if (!entry || typeof entry !== 'object') return unknown;
  const codon = typeof entry.codon === 'string' && entry.codon.length > 0 ? entry.codon : null;
  // 有真实等位基因数或显隐性字符串就直接显示，不再卡来源标记。
  const geno = typeof entry.geno === 'string' && entry.geno.length > 0
    ? entry.geno
    : genoFromAlleles(entry.geneD, entry.geneP);
  if (!geno) return { ...unknown, codon };
  return { genoVerified: true, geno, codon };
}

export function passwordFor(color, codon, genoVerified) {
  if (typeof color === 'string' && Object.hasOwn(BASE_PASSWORD, color)) return BASE_PASSWORD[color];
  // 突变等非基础体色才用基因码末位作为提供密码；没有基因码就只能未知。
  if (typeof codon !== 'string' || !codon) return null;
  return codon.slice(-1);
}
