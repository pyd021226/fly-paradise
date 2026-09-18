// Conservative high-DPI pressure relief; positions and hit testing remain in CSS pixels.
export class RenderBudget {
  constructor() { this.scale = 1; this.slow = 0; this.fast = 0; this.lastChange = 0; }
  sample({ interval, work, population, dpr, now, enabled }) {
    const before = this.scale;
    if (!enabled || population < 64) {
      this.scale = 1; this.slow = this.fast = 0;
      return before !== this.scale;
    }
    if (interval <= 0 || interval > 150) return false;
    // Never reduce below one backing pixel per CSS pixel.
    const floor = 1 / Math.max(1, dpr);
    if (interval > 22 || work > 18) { this.slow++; this.fast = 0; }
    else if (interval < 18 && work < 12) { this.fast++; this.slow = 0; }
    else { this.slow = this.fast = 0; }
    if (now - this.lastChange < 5000) return false;
    if (this.slow >= 90) this.scale = Math.max(floor, this.scale - 0.15);
    else if (this.fast >= 300) this.scale = Math.min(1, this.scale + 0.1);
    if (before !== this.scale) {
      this.slow = this.fast = 0; this.lastChange = now;
    }
    return before !== this.scale;
  }
}
