// One background raster job at a time: bounded memory and no per-fly messages.
// Frequent poses go first; waiting time prevents uncommon poses from starving.
export class SpriteCache {
  constructor() {
    this.cache = new Map();
    this.queue = new Map();
    this.busy = null;
    this.timer = null;
    this.worker = null;
    this.failed = false;
  }

  get(morph, sex, pose) {
    const key = `${morph}:${sex}:${pose}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed || this.busy === key) return null;
    const job = this.queue.get(key);
    if (job) job.hits++;
    else if (this.cache.size + this.queue.size + (this.busy ? 1 : 0) < 30) {
      this.queue.set(key, { key, morph, sex, pose, hits: 1, queuedAt: performance.now() });
    }
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./sprite-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }) => {
          if (data.error || data.key !== this.busy || !data.bitmap) {
            data.bitmap?.close();
            this.dispose();
            return;
          }
          clearTimeout(this.timer);
          this.cache.set(data.key, data.bitmap);
          this.busy = null;
          this.dispatch();
        };
        this.worker.onerror = () => this.dispose();
        this.worker.onmessageerror = () => this.dispose();
      } catch {
        this.dispose();
        return null;
      }
    }
    this.dispatch();
    return null;
  }

  dispatch() {
    if (this.busy || this.failed || !this.queue.size) return;
    const now = performance.now();
    const score = (job) => Math.log2(job.hits + 1) + (now - job.queuedAt) / 100;
    let selected;
    for (const job of this.queue.values()) {
      if (!selected || score(job) > score(selected)) selected = job;
    }
    this.queue.delete(selected.key);
    this.busy = selected.key;
    this.timer = setTimeout(() => this.dispose(), 10000);
    try { this.worker.postMessage(selected); } catch { this.dispose(); }
  }

  dispose() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
    this.queue.clear();
    this.busy = null;
    this.failed = true;
  }
}
