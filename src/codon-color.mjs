// 片段触发：1124 绿 / 1123 红 / 1122 黄，整串任意连续四位。隐/亮看片段后面紧跟的位。最长 9，再叠挤掉第一位。

export const FAMILIES = {
  '1124': 'green',
  '1123': 'red',
  '1122': 'yellow',
};

export const CODON_MAX = 9;

export function appendCodon(base, digit) {
  const next = String(base || '') + String(digit || '');
  return next.length > CODON_MAX ? next.slice(next.length - CODON_MAX) : next;
}

export function familyHit(codon) {
  const s = String(codon || '');
  if (s.length < 4) return null;
  for (let i = 0; i <= s.length - 4; i++) {
    const frag = s.slice(i, i + 4);
    const color = FAMILIES[frag];
    if (color) return { fam: frag, index: i, color };
  }
  return null;
}

export function codonPhenotype(codon) {
  const hit = familyHit(codon);
  if (!hit) return null;
  const d4 = hit.fam[3];
  const after = String(codon).slice(hit.index + 4);
  if (!after.length) return { color: hit.color, bright: false };
  if (after[0] !== d4) return null;
  if (after.length === 1) return { color: hit.color, bright: false };
  return { color: hit.color, bright: after[1] === d4 };
}

export function colorFromCodon(codon, fallback) {
  const look = codonPhenotype(codon);
  if (!look) return fallback || 'wild';
  return look.bright ? look.color + '2' : look.color;
}
