import { createFlyArt } from './fly-art.js';
import { SPRITE_FRAMES, SPRITE_SIZE } from './sprite-layout.js';

const genes = {
  wild: [0, 0, 0], mid: [0, 2, 0], deep: [2, 0, 0],
  white: [2, 2, 0], green: [2, 2, 2],
};

self.onmessage = ({ data: { key, morph, sex, pose } }) => {
  try {
    const canvas = new OffscreenCanvas(SPRITE_SIZE * SPRITE_FRAMES, SPRITE_SIZE);
    const ctx = canvas.getContext('2d');
    const art = createFlyArt(ctx);
    const [geneD, geneP, geneG] = genes[morph];
    art.applyBody({ geneD, geneP, geneG }, sex === 'm', false, 0);
    for (let i = 0; i < SPRITE_FRAMES; i++) {
      ctx.save();
      ctx.translate(i * 64 + 32, 32);
      ctx.scale(4, 4);
      const phase = i / SPRITE_FRAMES * Math.PI * 2;
      art.drawDorsal(pose === 'fly', phase / (pose === 'fly' ? 0.55 : 0.028), 0, pose === 'groom');
      ctx.restore();
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ key, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ key, error: String(error) });
  }
};
