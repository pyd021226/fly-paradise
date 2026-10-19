import {rarityForColor, rarityByGrade} from './cabinet-rarity.mjs';

// 命名规则与等级判定：直接复用旧项目已验证实现（保留归属说明）。
export const NAME_LIMIT = 20;
export const nameLength = (value) => Array.from(value).length;
export const canNameGrade = (level) => Number.isInteger(level?.rank) && level.rank >= rarityByGrade('S').rank;
export const canNameColor = (color) => canNameGrade(rarityForColor(color));

export function normalizeName(value) {
  if (typeof value !== 'string') throw Error('名称必须为文字');
  // 先检查换行再 trim：粘贴进来的首尾换行同样是非法的。
  if (/[\r\n\u0085\u2028\u2029]/u.test(value)) throw Error('名称不允许换行');
  const name = value.trim();
  if (nameLength(name) > NAME_LIMIT) throw Error('名称最多 20 个 Unicode 字符');
  return name;
}
