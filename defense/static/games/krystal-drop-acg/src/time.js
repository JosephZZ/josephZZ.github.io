// Global timing.  Checklist 2.1.1 / 5.1.1:
//   GetTimeSlice(q) = ((t - t%q) - (tPrev - tPrev%q)) / q
// It counts how many global grid boundaries of width q were crossed since the
// previous frame.  It is deliberately NOT a per-instance accumulator.

export const Time = {
  tick: 0,        // ms since program start
  lastTick: 0,    // tick of the previous frame
  elapsed: 0,     // seconds between the two last frames (real dt)
  _origin: 0,
  init(now) { this._origin = now; this.tick = 0; this.lastTick = 0; this.elapsed = 0; },
  frame(now) {
    this.lastTick = this.tick;
    this.tick = (now - this._origin) | 0;
    this.elapsed = (this.tick - this.lastTick) / 1000;
  },
};

export function GetTimeSlice(q) {
  const t = Time.tick, p = Time.lastTick;
  return ((t - (t % q)) - (p - (p % q))) / q;
}

export function GetTimeElapsed() { return Time.elapsed; }
export function GetTick() { return Time.tick; }
