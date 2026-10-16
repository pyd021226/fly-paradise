// 测试期推演引擎（与 supabase/functions/_shared/genetics.ts 同步）。改规则两处一起改。

export const FAMILIES = {
  "1124": "green",
  "1123": "red",
  "1122": "yellow",
};

export function passRecessive(n) {
  if (n >= 2) return 1;
  if (n <= 0) return 0;
  return Math.random() < 0.5 ? 1 : 0;
}

export function inheritGene(a, b) {
  return passRecessive(a) + passRecessive(b);
}

/** A/B 两套基因都至少留一份杂合，褐永远是 AaBb，开局不会死局。 */
export function clampCarrier(geneD, geneP) {
  return { geneD: Math.max(1, geneD), geneP: Math.max(1, geneP) };
}

export function formatGeno(geneD, geneP) {
  const one = (n, dom, rec) => {
    if (n >= 2) return dom + dom;
    if (n <= 0) return rec + rec;
    return dom + rec;
  };
  return one(geneD, "A", "a") + one(geneP, "B", "b");
}

/** 亲本这一位点传出显性等位基因的概率（0 / 0.5 / 1） */
export function allelePass(n) {
  if (n >= 2) return 1;
  if (n <= 0) return 0;
  return 0.5;
}

/** 两只亲本产出白色（D=2 且 P=2）的精确概率 */
export function whiteChance(a, b) {
  return allelePass(a.gene_d) * allelePass(b.gene_d) * allelePass(a.gene_p) * allelePass(b.gene_p);
}

export function clutchSexes(n) {
  if (n <= 0) return [];
  if (n === 1) return [Math.random() < 0.5 ? "m" : "f"];
  const s = ["m", "f"];
  for (let i = 2; i < n; i++) s.push(Math.random() < 0.5 ? "m" : "f");
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  return s;
}

export function morphBase(geneD, geneP) {
  const dark = geneD >= 2;
  const mid = geneP >= 2;
  if (dark && mid) return "white";
  if (dark) return "deep";
  if (mid) return "mid";
  return "wild";
}

export function baseDigitOf(geneD, geneP) {
  const m = morphBase(geneD, geneP);
  if (m === "mid") return "2";
  if (m === "deep") return "3";
  if (m === "white") return "4";
  return "1";
}

export function familyOf(codon) {
  if (!codon || codon.length < 4) return null;
  for (let i = 0; i <= codon.length - 4; i++) {
    const frag = codon.slice(i, i + 4);
    if (FAMILIES[frag]) return frag;
  }
  return null;
}

export function mutationLook(codon) {
  if (!codon || codon.length < 4) return null;
  let hit = null;
  let idx = -1;
  for (let i = 0; i <= codon.length - 4; i++) {
    const frag = codon.slice(i, i + 4);
    if (FAMILIES[frag]) { hit = frag; idx = i; break; }
  }
  if (!hit) return null;
  const color = FAMILIES[hit];
  const d4 = hit[3];
  const after = codon.slice(idx + 4);
  if (!after.length) return { color, bright: false };
  if (after[0] !== d4) return null;
  if (after.length === 1) return { color, bright: false };
  return { color, bright: after[1] === d4 };
}

export function appendCodon(base, digit) {
  const next = String(base || "") + String(digit || "");
  return next.length > 9 ? next.slice(next.length - 9) : next;
}

export function mutationOf(codon) {
  const look = mutationLook(codon);
  if (!look) return null;
  return look.bright ? 2 : 1;
}

export function mutateCodon(codon) {
  if (!codon || codon.length < 3) return codon;
  // 前两位锁死。其余任意一位以 0.5% 突变（命中后随机抽一位改）。
  if (Math.random() >= 0.005) return codon;
  const idx = 2 + Math.floor(Math.random() * (codon.length - 2));
  const d = codon[idx];
  const opts = ["1", "2", "3", "4"].filter((x) => x !== d);
  const n = opts[Math.floor(Math.random() * opts.length)];
  return codon.slice(0, idx) + n + codon.slice(idx + 1);
}

export function lastDigitOf(g) {
  if (g.codon && g.codon.length) return g.codon[g.codon.length - 1];
  return baseDigitOf(g.gene_d, g.gene_p);
}

export function asBlood(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw;
  for (const fam of Object.keys(FAMILIES)) {
    const v = obj[fam];
    if (typeof v === "number") {
      if (v > 0) out[fam] = { n: v, charge: 0 };
    } else if (v && typeof v === "object") {
      const n = Number(v.n) || 0;
      const charge = Number(v.charge) || 0;
      if (n > 0 || charge > 0) out[fam] = { n, charge };
    }
  }
  return out;
}

function cloneBlood(blood) {
  const out = {};
  for (const fam of Object.keys(blood)) {
    const s = blood[fam];
    out[fam] = { n: s.n, charge: s.charge };
  }
  return out;
}

export function tickBlood(followBlood, followCodon, otherCodon) {
  const blood = cloneBlood(followBlood);
  const followFam = familyOf(followCodon);
  const otherFam = familyOf(otherCodon);
  if (!followFam && !otherFam) return blood;

  for (const fam of Object.keys(FAMILIES)) {
    const slot = blood[fam] ? { n: blood[fam].n, charge: blood[fam].charge } : { n: 0, charge: 0 };
    if (otherFam && fam === otherFam) {
      slot.n += 1;
      if (slot.n > 0 && slot.n % 3 === 0) slot.charge = slot.n;
    } else {
      if (slot.n > 0) slot.n -= 1;
      if (slot.n < slot.charge) slot.charge = 0;
    }
    if (slot.n > 0 || slot.charge > 0) blood[fam] = slot;
    else delete blood[fam];
  }
  return blood;
}

export function takeResonance(blood) {
  let bestFam = null;
  let bestN = 0;
  let tie = false;
  for (const fam of Object.keys(FAMILIES)) {
    const n = blood[fam]?.n || 0;
    if (n > bestN) {
      bestFam = fam;
      bestN = n;
      tie = false;
    } else if (n > 0 && n === bestN) {
      tie = true;
    }
  }
  if (!bestFam || tie || bestN <= 0) return null;
  const slot = blood[bestFam];
  if (!slot || !slot.charge || slot.charge > slot.n) return null;
  const next = cloneBlood(blood);
  next[bestFam] = { n: slot.n, charge: 0 };
  return { color: FAMILIES[bestFam], blood: next };
}

export function colorOf(geneD, geneP, codon, blood) {
  const b = asBlood(blood);
  const look = mutationLook(codon);
  if (look) {
    if (look.bright) return { color: look.color + "2", level: 2, blood: b };
    return { color: look.color, level: 1, blood: b };
  }
  const taken = takeResonance(b);
  if (taken) return { color: taken.color, level: 0, blood: taken.blood };
  return { color: morphBase(geneD, geneP), level: 0, blood: b };
}

export function initialGenome() {
  return { geneD: 1, geneP: 1, codon: "1", blood: {} };
}

export function breedGenome(a, b, appendFromId) {
  const egg = simulateEgg(a, b, appendFromId);
  return { geneD: egg.geneD, geneP: egg.geneP, codon: egg.codon, blood: egg.bloodOut };
}

const FAM_NAME = {
  "1124": "绿",
  "1123": "红",
  "1122": "黄",
};

export function colorName(color) {
  const map = {
    wild: "褐",
    mid: "中褐",
    deep: "深褐",
    white: "白",
    green: "绿",
    green2: "绿亮",
    red: "红",
    red2: "红亮",
    yellow: "黄",
    yellow2: "黄亮",
  };
  return map[color] || color;
}

export function formatBlood(blood) {
  const parts = [];
  for (const fam of Object.keys(FAMILIES)) {
    const s = blood[fam];
    if (!s || (s.n <= 0 && s.charge <= 0)) continue;
    parts.push(FAM_NAME[fam] + s.n + (s.charge ? "充" + s.charge : ""));
  }
  return parts.length ? parts.join(" ") : "无突变";
}

function bloodPhrase(blood) {
  const s = formatBlood(blood);
  return s === "无突变" ? "无突变" : "血 " + s;
}

function leaderInfo(blood) {
  let fam = null;
  let n = 0;
  let tie = false;
  for (const f of Object.keys(FAMILIES)) {
    const v = blood[f]?.n || 0;
    if (v > n) {
      fam = f;
      n = v;
      tie = false;
    } else if (v > 0 && v === n) {
      tie = true;
    }
  }
  return { fam, n, tie };
}

function explainEgg(codon, followCodon, otherCodon, bloodTick, bloodOut, color, geneD, geneP) {
  const look = mutationLook(codon);
  const skip = !familyOf(followCodon) && !familyOf(otherCodon);
  const bits = [];
  if (look) {
    const fam = familyOf(codon);
    bits.push("主链 " + codon + " 自己显" + (fam ? FAM_NAME[fam] : colorName(look.color)) + (look.bright ? "亮一档" : ""));
    bits.push("不借脸，充能保留");
    bits.push(bloodPhrase(bloodOut));
    return bits.join("。") + "。";
  }
  if (skip) {
    bits.push("两只普通褐不走血账");
    bits.push("主链 " + (codon || "空") + " 无门");
    bits.push("脸上底色" + colorName(morphBase(geneD, geneP)));
    bits.push(bloodPhrase(bloodOut));
    return bits.join("。") + "。";
  }
  const fam = familyOf(codon);
  bits.push(fam ? "主链 " + codon + " 隐" : "主链 " + (codon || "空") + " 还没成门");
  const lead = leaderInfo(bloodTick);
  const borrowed = color === "green" || color === "red" || color === "yellow" ||
    color === "green2" || color === "red2" || color === "yellow2";
  if (lead.tie) {
    bits.push("并列不共振");
  } else if (!lead.fam) {
    bits.push("血里没有门");
  } else {
    const slot = bloodTick[lead.fam];
    const name = FAM_NAME[lead.fam];
    if (slot && slot.charge && slot.charge <= slot.n) {
      bits.push(name + lead.n + " 领先且有充能，借" + name + "脸，充能花掉");
    } else {
      bits.push(name + lead.n + " 领先但没有充能，不借脸");
      for (const f of Object.keys(FAMILIES)) {
        if (f === lead.fam) continue;
        const s = bloodTick[f];
        if (s && s.charge && s.n > 0) bits.push(FAM_NAME[f] + s.n + " 有充能但被压住");
      }
    }
  }
  if (!borrowed) bits.push("脸上底色" + colorName(color));
  bits.push(bloodPhrase(bloodOut));
  return bits.join("。") + "。";
}

export function simulateEgg(a, b, appendFromId) {
  const inherited = clampCarrier(inheritGene(a.gene_d, b.gene_d), inheritGene(a.gene_p, b.gene_p));
  const geneD = inherited.geneD;
  const geneP = inherited.geneP;
  const inheritA = Math.random() < 0.5;
  const followSide = inheritA ? "a" : "b";
  const follow = inheritA ? a : b;
  const other = inheritA ? b : a;
  let digitFrom;
  let digitSrc;
  let digit;
  if (appendFromId && appendFromId === a.fly_id) {
    digitFrom = "a";
    digitSrc = "a";
    digit = baseDigitOf(a.gene_d, a.gene_p);
  } else if (appendFromId && appendFromId === b.fly_id) {
    digitFrom = "b";
    digitSrc = "b";
    digit = baseDigitOf(b.gene_d, b.gene_p);
  } else {
    digitFrom = "rand";
    digitSrc = Math.random() < 0.5 ? "a" : "b";
    const src = digitSrc === "a" ? a : b;
    digit = baseDigitOf(src.gene_d, src.gene_p);
  }
  const codonBeforeMut = appendCodon(follow.codon || "", digit);
  const codon = mutateCodon(codonBeforeMut);
  const bloodIn = asBlood(follow.blood);
  const bloodTick = tickBlood(bloodIn, follow.codon || "", other.codon || "");
  const pheno = colorOf(geneD, geneP, codon, bloodTick);
  return {
    follow: followSide,
    digitFrom,
    digitSrc,
    digit,
    geneD,
    geneP,
    sex: "m",
    codon,
    codonBeforeMut,
    mutated: codon !== codonBeforeMut,
    bloodIn,
    bloodTick,
    bloodOut: pheno.blood,
    color: pheno.color,
    level: pheno.level,
    why: explainEgg(codon, follow.codon || "", other.codon || "", bloodTick, pheno.blood, pheno.color, geneD, geneP),
  };
}

export function simulateClutch(a, b, n) {
  const size = Math.max(1, Math.min(8, Math.floor(n) || 3));
  const sexes = clutchSexes(size);
  const eggs = [];
  for (let i = 0; i < size; i++) {
    const append = i === 0 ? a.fly_id : i === 1 ? b.fly_id : null;
    eggs.push({ ...simulateEgg(a, b, append), sex: sexes[i] });
  }
  return eggs;
}

export function mutationProbability(level, gen) {
  const k = gen - 4;
  if (k < 0) return 0;
  let cur = new Map();
  cur.set(1, { on: 1, off: 0 });
  for (let step = 0; step < k; step++) {
    const next = new Map();
    const add = (lv, on, cnt) => {
      if (cnt <= 0) return;
      if (!next.has(lv)) next.set(lv, { on: 0, off: 0 });
      const s = next.get(lv);
      if (on) s.on += cnt;
      else s.off += cnt;
    };
    for (const [lv, s] of cur) {
      add(lv, true, s.on);
      add(lv, false, s.on * 3);
      add(lv, true, s.off * 3);
      add(lv + 1, true, s.off);
    }
    cur = next;
  }
  const s = cur.get(level);
  if (!s) return 0;
  return s.on / Math.pow(4, k);
}
