 // Shared vector artwork for the live renderer and background sprite worker.
export function createFlyArt(ctx) {
const COL = {
  eye: '#d44532',
  eyeDark: '#7a1810',
  eyeHi: '#f4a090',
  thorax: '#d4a056',
  thoraxDark: '#b07a38',
  abdomen: '#ead7aa',
  band: '#2e2014',
  wing: 'rgba(248,250,252,0.5)',
  vein: 'rgba(70,70,70,0.4)',
  leg: '#c6a66c',
  head: '#c48a48',
  maleTip: null,
};

const PALETTE = {
  wild: { thorax: '#d4a056', thoraxDark: '#b07a38', abdomen: '#ead7aa', band: '#2e2014', head: '#c48a48', leg: '#c6a66c' },
  mid: { thorax: '#aa743c', thoraxDark: '#c49050', abdomen: '#c8a878', band: '#3a2410', head: '#8e5c28', leg: '#966834' },
  deep: { thorax: '#4a2c12', thoraxDark: '#8a5a28', abdomen: '#6b4524', band: '#1a0e08', head: '#3a220e', leg: '#4a3218' },
  white: { thorax: '#f3eee4', thoraxDark: '#d8d0c4', abdomen: '#fffcf6', band: '#6b6358', head: '#efe8dc', leg: '#c4b8a8' },
  green: { thorax: '#1aa85a', thoraxDark: '#c8f080', abdomen: '#148a48', band: '#0d3a20', head: '#127a40', leg: '#1a5a32' },
  rainbow: { thorax: '#e23d7a', thoraxDark: '#7a3dff', abdomen: '#3dd4e2', band: '#1a1030', head: '#f0c040', leg: '#6a4cff' },
};

const PALETTE_DEAD = {
  wild: { thorax: '#6a4a22', thoraxDark: '#3a2810', abdomen: '#8a7350', band: '#1a1008', head: '#5a3818', leg: '#6a5030' },
  mid: { thorax: '#6a4e28', thoraxDark: '#3a2c14', abdomen: '#8a6e48', band: '#1a1008', head: '#5a3c1c', leg: '#6a5030' },
  deep: { thorax: '#2a180c', thoraxDark: '#140c06', abdomen: '#4a3020', band: '#100804', head: '#241408', leg: '#2a1c10' },
  white: { thorax: '#b8b0a4', thoraxDark: '#7a7468', abdomen: '#d4ccc0', band: '#4a443c', head: '#a0988c', leg: '#8a8278' },
  green: { thorax: '#2a5a38', thoraxDark: '#143820', abdomen: '#3a6a44', band: '#0c2014', head: '#1e4028', leg: '#244830' },
  rainbow: { thorax: '#5a2848', thoraxDark: '#2a1840', abdomen: '#28485a', band: '#140c20', head: '#5a4830', leg: '#30245a' },
};

function morphOf(geneD, geneP, geneG, geneX, geneY) {
  const dark = (geneD || 0) >= 2;
  const mid = (geneP || 0) >= 2;
  const green = (geneG || 0) >= 2;
  if (dark && mid && green) {
    if ((geneX || 0) >= 2 && (geneY || 0) >= 2) return 'rainbow';
    return 'green';
  }
  if (dark && mid) return 'white';
  if (dark) return 'deep';
  if (mid) return 'mid';
  return 'wild';
}

function paintRainbow(seed, now) {
  const h = ((now || 0) * 0.09 + (seed || 0) * 47) % 360;
  COL.thorax = `hsl(${h}, 82%, 50%)`;
  COL.thoraxDark = `hsl(${(h + 48) % 360}, 72%, 38%)`;
  COL.abdomen = `hsl(${(h + 96) % 360}, 78%, 56%)`;
  COL.band = `hsl(${(h + 180) % 360}, 40%, 18%)`;
  COL.head = `hsl(${(h + 24) % 360}, 80%, 44%)`;
  COL.leg = `hsl(${(h + 60) % 360}, 48%, 36%)`;
  COL.eye = `hsl(${(h + 300) % 360}, 70%, 52%)`;
  COL.eyeDark = `hsl(${(h + 300) % 360}, 55%, 28%)`;
  COL.eyeHi = `hsl(${(h + 300) % 360}, 70%, 78%)`;
}

function applyBody(src, male, dead, now) {
  const morph = morphOf(src.geneD, src.geneP, src.geneG, src.geneX, src.geneY);
  if (morph === 'rainbow' && !dead) {
    paintRainbow(src.seed, now);
    COL.maleTip = male ? '#140c08' : null;
    return;
  }
  const p = (dead ? PALETTE_DEAD : PALETTE)[morph] || PALETTE.wild;
  COL.thorax = p.thorax;
  COL.thoraxDark = p.thoraxDark;
  COL.abdomen = p.abdomen;
  COL.band = p.band;
  COL.head = p.head;
  COL.leg = p.leg;
  COL.eye = '#d44532';
  COL.eyeDark = '#7a1810';
  COL.eyeHi = '#f4a090';
  COL.maleTip = male ? (dead ? '#100804' : '#140c08') : null;
}

function paintMaleTip(view) {
  if (!COL.maleTip) return;
  ctx.save();
  ctx.beginPath();
  if (view === 'dorsal') {
    ctx.moveTo(-0.55, 1.7);
    ctx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
    ctx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = COL.maleTip;
    ctx.beginPath();
    ctx.ellipse(0, 4.55, 1.7, 1.45, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.ellipse(2.15, 0.55, 1.85, 1.2, -0.1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = COL.maleTip;
    ctx.beginPath();
    ctx.ellipse(3.55, 0.55, 1.05, 1.15, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeLeg(ax, ay, bx, by, cx, cy) {
  ctx.strokeStyle = COL.leg;
  ctx.lineWidth = 0.55;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.stroke();
}

function drawDorsalWing(side, angle) {
  ctx.save();
  ctx.translate(side * 1.5, 0.22);
  ctx.rotate(side * angle);
  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(side * 2.2, -1.15, side * 4.5, -0.75, side * 5.15, 0.12);
  ctx.bezierCurveTo(side * 4.6, 1.15, side * 2.0, 1.25, side * 0.2, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * 3.0, -0.12, side * 4.9, 0.16);
  ctx.stroke();
  ctx.restore();
}

function wingAngle(now, seed, phase) {
  return 0.12 + 0.5 * Math.sin(now * 0.55 + seed + phase);
}

function drawDorsalWingsFolded() {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(side * 0.28, 0.55);
    ctx.rotate(side * 0.08);
    ctx.fillStyle = COL.wing;
    ctx.strokeStyle = COL.vein;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(side * 0.7, 0.5, side * 0.9, 2.2, side * 0.25, 4.3);
    ctx.bezierCurveTo(side * -0.35, 4.5, 0, 2.0, 0, 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawDorsal(flying, now, seed, grooms) {
  const flap = flying ? wingAngle(now, seed, 0) : 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.4, 4.0, 2.4, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  if (flying) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    drawDorsalWing(-1, wingAngle(now, seed, 0.9));
    drawDorsalWing(1, wingAngle(now, seed, 0.9));
    ctx.globalAlpha = 0.18;
    drawDorsalWing(-1, wingAngle(now, seed, 1.8));
    drawDorsalWing(1, wingAngle(now, seed, 1.8));
    ctx.restore();
    drawDorsalWing(-1, flap);
    drawDorsalWing(1, flap);
  } else {
    drawDorsalWingsFolded();
  }

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.moveTo(-0.55, 1.7);
  ctx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
  ctx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
  ctx.closePath();
  ctx.fill();
  paintMaleTip('dorsal');
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 4; i++) {
    const y = 2.25 + i * 0.68;
    const w = 1.35 - i * 0.18;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + 0.2, w, y);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(0, 1.85, 0.48, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0.4, 1.65, 1.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.thoraxDark;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(0, 0.3, 0.95, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(0, -1.15, 0.48, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -1.85, 0.88, 0.74, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5a3a18';
  ctx.lineWidth = 0.28;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.3, -2.45);
    ctx.lineTo(side * 0.62, -3.05);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(side * 0.5, -2.0, 0.12, side * 0.62, -1.85, 0.78);
    g.addColorStop(0, COL.eyeHi);
    g.addColorStop(0.45, COL.eye);
    g.addColorStop(1, COL.eyeDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(side * 0.7, -1.88, 0.58, 0.64, side * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  if (grooms) {
    const rub = Math.sin(now * 0.028);
    strokeLeg(-0.7, -1.1, -1.35, -1.7 + rub * 0.35, -0.85, -2.15 - rub * 0.2);
    strokeLeg(0.7, -1.1, 1.35, -1.7 - rub * 0.35, 0.85, -2.15 + rub * 0.2);
  }
}

function drawSide(now, seed, grooms) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.3, 3.4, 2.6, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  const rub = grooms ? Math.sin(now * 0.028) : 0;
  if (grooms) {
    strokeLeg(-1.8, 0.15, -2.4, 0.55 + rub * 0.45, -2.15, 1.15 - rub * 0.35);
    strokeLeg(-1.55, 0.2, -2.15, 0.7 - rub * 0.4, -1.9, 1.25 + rub * 0.3);
  } else {
    strokeLeg(-1.1, 0.6, -2.0, 2.0, -2.4, 3.3);
  }
  strokeLeg(0.2, 0.8, -0.2, 2.2, -0.5, 3.5);
  strokeLeg(1.4, 0.9, 1.8, 2.3, 2.1, 3.6);

  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.7);
  ctx.bezierCurveTo(0.5, -1.9, 3.0, -1.65, 4.35, -0.12);
  ctx.bezierCurveTo(3.7, 1.0, 1.35, 0.9, 0.15, 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.55);
  ctx.quadraticCurveTo(2.35, -1.0, 4.1, -0.08);
  ctx.stroke();

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.ellipse(2.15, 0.55, 1.85, 1.2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  paintMaleTip('side');
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) {
    const x = 1.35 + i * 0.58;
    ctx.beginPath();
    ctx.moveTo(x, -0.3);
    ctx.lineTo(x + 0.12, 1.55);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(1.2, 0.32, 0.4, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.05, 0.15, 1.4, 1.28, 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0.1, 0.4, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2.1, 0.02, 0.82, 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5a3a18';
  ctx.lineWidth = 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.55, -0.5);
  ctx.lineTo(-3.05, -1.02);
  ctx.stroke();

  const eg = ctx.createRadialGradient(-2.22, -0.18, 0.12, -2.1, 0.02, 0.75);
  eg.addColorStop(0, COL.eyeHi);
  eg.addColorStop(0.4, COL.eye);
  eg.addColorStop(1, COL.eyeDark);
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.ellipse(-2.25, -0.1, 0.62, 0.68, 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawOblique(flying, now, seed, grooms) {
  const flap = flying ? 0.5 + 0.35 * Math.sin(now * 0.55 + seed) : 0.2;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.5, 4.6, 2.5, 1.0, 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (flying) {
    ctx.save();
    ctx.translate(1.15, -0.15);
    ctx.rotate(-0.05 + flap * 0.7);
  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(2.0, -0.95, 4.35, -0.35, 4.85, 0.95);
  ctx.bezierCurveTo(3.7, 1.7, 1.35, 1.25, 0, 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.translate(-0.9, -0.2);
  ctx.rotate(-0.9 - flap * 0.15);
  ctx.fillStyle = COL.wing;
  ctx.beginPath();
  ctx.ellipse(1.7, 0.35, 2.15, 0.75, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(0.35, 0.35);
    ctx.rotate(0.55);
    ctx.fillStyle = COL.wing;
    ctx.strokeStyle = COL.vein;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.8, 0.4, 1.2, 2.0, 0.4, 3.6);
    ctx.bezierCurveTo(-0.3, 3.7, 0.1, 1.6, 0, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.ellipse(1.55, 2.05, 1.35, 1.75, 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) {
    const y = 1.2 + i * 0.62;
    ctx.beginPath();
    ctx.moveTo(0.55, y);
    ctx.lineTo(2.65, y + 0.22);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(0.7, 1.25, 0.4, 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.15, 0.2, 1.45, 1.35, 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(-0.35, -0.85, 0.4, 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.7, -1.5, 0.74, 0.64, 0.15, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(-0.88, -1.65, 0.12, -0.7, -1.45, 0.7);
  g.addColorStop(0, COL.eyeHi);
  g.addColorStop(0.4, COL.eye);
  g.addColorStop(1, COL.eyeDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-0.85, -1.52, 0.56, 0.6, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.eyeDark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.15, -1.6, 0.28, 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}


return { COL, applyBody, drawDorsal, drawSide, morphOf };
}
