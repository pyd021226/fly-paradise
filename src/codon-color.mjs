// 主链显色：1124 绿 / 1123 红 / 1122 黄。第 7 位起暂不解释。

export const FAMILIES = {
  '1124': 'green',
  '1123': 'red',
  '1122': 'yellow',
};

export function codonPhenotype(codon) {
  if (!codon || codon.length < 4) return null;
  const prefix = codon.slice(0, 4);
  const color = FAMILIES[prefix];
  if (!color) return null;
  const d4 = prefix[3];
  if (codon.length === 4) return { color, bright: false };
  if (codon.length === 5) {
    if (codon[4] !== d4) return null;
    return { color, bright: false };
  }
  return { color, bright: codon[5] === d4 };
}

export function colorFromCodon(codon, fallback) {
  const look = codonPhenotype(codon);
  if (!look) return fallback || 'wild';
  return look.bright ? look.color + '2' : look.color;
}
