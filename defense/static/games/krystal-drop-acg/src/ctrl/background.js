// Scrolling title1.png wallpaper (checklist 1.2.1, 2.6.1).
// It lives at KD_LAST_POS and is disabled while a game is running (7.1.1).
import { Controller } from '../kernel.js';
import { Display } from '../display.js';
import { GetTimeElapsed } from '../time.js';

export class BackgroundController extends Controller {
  constructor(res) {
    super();
    this.img = res.img.title1;
    this.X = new Float64Array(20);
    this.Y = new Float64Array(20);
    this.reset();
  }

  reset() {
    // 1.2.1
    for (let i = 0; i < 5; i++) {
      this.X[i] = i * 128 + 640;
      this.X[i + 5] = i * 128 + 1280;
      this.X[i + 10] = i * 128 + 1280;
      this.X[i + 15] = i * 128 + 640;
      this.Y[i] = i * 192;
      this.Y[i + 5] = i * 192;
      this.Y[i + 10] = i * 192 + 480;
      this.Y[i + 15] = i * 192 + 480;
    }
  }

  update() {
    // 2.6.1 - 300 px/s left, 80 px/s up
    const incr = GetTimeElapsed() * 100;
    for (let i = 0; i < 20; i++) {
      this.X[i] -= incr * 3;
      this.Y[i] -= incr * 0.8;
      if (this.X[i] < -640) this.X[i] += 1280;
      if (this.Y[i] < -480) this.Y[i] += 960;
    }
  }

  display() {
    for (let i = 0; i < 20; i++) Display.blit(this.img, this.X[i], this.Y[i]);
  }
}
