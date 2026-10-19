import zlib from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('不是 PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }
  if (depth !== 8 || interlace !== 0) throw Error('仅支持 8 位非隔行 PNG：depth=' + depth + ' interlace=' + interlace);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw Error('仅支持 RGB/RGBA PNG：colorType=' + colorType);
  if (width < 1 || height < 1 || width > 1024 || height > 1024) throw Error('快照尺寸无效');
  const stride = width * channels;
  const expected = height * (stride + 1);
  const raw = zlib.inflateSync(Buffer.concat(idat), {maxOutputLength: expected});
  if (raw.length !== expected) throw Error('PNG 像素数据不完整');
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp];
    if (filter > 4) throw Error('PNG 过滤类型无效');
    rp += 1;
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= channels && y > 0) ? out[prev + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[row + x] = value & 0xff;
    }
  }
  return {width, height, channels, pixels: out};
}

export function imageStats(buffer) {
  const {width, height, channels, pixels} = decodePng(buffer);
  const colors = new Map();
  for (let i = 0; i < width * height; i += 1) {
    const o = i * channels;
    const key = `${pixels[o]},${pixels[o + 1]},${pixels[o + 2]}`;
    colors.set(key, (colors.get(key) || 0) + 1);
  }
  let top = '';
  let topCount = 0;
  for (const [key, count] of colors) {
    if (count > topCount) { topCount = count; top = key; }
  }
  const total = width * height;
  const bg = top.split(',').map(Number);
  let differing = 0;
  let maxDistance = 0;
  for (let i = 0; i < total; i += 1) {
    const o = i * channels;
    const d = Math.abs(pixels[o] - bg[0]) + Math.abs(pixels[o + 1] - bg[1]) + Math.abs(pixels[o + 2] - bg[2]);
    if (d > 12) differing += 1;
    if (d > maxDistance) maxDistance = d;
  }
  return {width, height, total, colors: colors.size, background: top, backgroundShare: topCount / total, differing, differingShare: differing / total, maxDistance};
}


export function snapshotHasContent(buffer) {
  try { const stats = imageStats(buffer); return stats.differing > 0; } catch { return false; }
}
