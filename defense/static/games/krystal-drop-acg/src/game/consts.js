// Gameplay constants and pre-computed animation tables (checklist 2.2.2, 2.6.3, 5.2).

export const GEM_SIZE = 32;
export const NB_KINDS = 4;                 // 1.4.3 - only nr/ng/nb/ny are enabled
export const GEM_NAMES = ['nr', 'ng', 'nb', 'ny'];
export const GEM_CHAR = { r: 0, g: 1, b: 2, y: 3 };

// 5.1.1
export const UPDATE_QUANTUM = 1000 / 50;   // 20 ms

// 5.2 - speeds are px per 20 ms tick
export const LINE_DOWN_SPEED = 3, LINE_DOWN_ACCEL = 0;
export const GEM_UP_SPEED = -2, GEM_UP_ACCEL = -1;
export const TAKE_HAND_SPEED = 3, TAKE_HAND_ACCEL = 5;
export const DROP_HAND_SPEED = -3, DROP_HAND_ACCEL = -1;
export const MAX_IN_HAND = 14;             // 5.2.5

// 5.3.1 - block states
export const ST_NONE = 0, ST_DOWN = 1, ST_DROP = 2, ST_UP = 4, ST_TAKE = 8;

export const FIELD_Y = 0;                  // row-local Y of the top of the field
export const FIELD_H = 12;                 // rows
export const HEIGHT_FIELD_IN_PIXEL = FIELD_H * GEM_SIZE;   // 384

// 2.2.2 - spring rebound table.
//   Anim_OffsetY[30 - i] = (short)(8 * cos(4 i / 2pi) * exp(-0.03 i)),  i = 1..30
export const ANIM_OFF_SIZE = 30;
export const ANIM_OFFSET_Y = new Int16Array(ANIM_OFF_SIZE + 1);
for (let i = 1; i <= ANIM_OFF_SIZE; i++) {
  ANIM_OFFSET_Y[ANIM_OFF_SIZE - i] =
    Math.trunc(8.0 * Math.cos(4 * i / (2 * Math.PI)) * Math.exp(-0.03 * i));
}
ANIM_OFFSET_Y[ANIM_OFF_SIZE] = 0;

// 2.6.3 - damped rebound of the title logo.
//   Anim_Offset[i] = |60 * sin(0.5 i / 2pi) * exp(-0.016 i)|
export const ANIM_OFFSET_SIZE = 150;
export const ANIM_OFFSET = new Float64Array(ANIM_OFFSET_SIZE);
for (let i = 0; i < ANIM_OFFSET_SIZE; i++) {
  ANIM_OFFSET[i] = Math.abs(60 * Math.sin(0.5 * i / (2 * Math.PI)) * Math.exp(-0.016 * i));
}

// 6.3.1 / 6.3.2 - survival difficulty curve
export const GEMS_TO_LEVEL = [20, 50, 80, 120, 160, 200, 250, 300, 350, 400, 500, 600, 700, 800, 1000];
export const SPEED_OF_LEVEL = [11000, 9500, 8000, 7000, 6000, 5000, 4500, 4000, 3500, 3100, 2700, 2300, 2000, 1700, 1500];

export const CHARACTERS = ['chaos', 'darkness', 'fire', 'forest', 'light', 'snow', 'space', 'time', 'water', 'wind'];

// 5.1.2 - block speed / position are 16 bit integers.
export function i16(v) { return (Math.trunc(v) << 16) >> 16; }
