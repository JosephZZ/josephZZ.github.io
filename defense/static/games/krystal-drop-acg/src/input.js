// Keyboard.  The game speaks SDL 1.2 key codes because the default bindings
// in kdrop.xml are raw SDL codes (checklist 4.1.1).
export const SDLK = {
  BACKSPACE: 8, TAB: 9, RETURN: 13, ESCAPE: 27, SPACE: 32,
  UP: 273, DOWN: 274, RIGHT: 275, LEFT: 276,
  RSHIFT: 303, LSHIFT: 304, RCTRL: 305, LCTRL: 306, RALT: 307, LALT: 308,
};

const CODE_MAP = {
  Escape: 27, Backspace: 8, Tab: 9, Enter: 13, NumpadEnter: 13, Space: 32,
  ArrowUp: 273, ArrowDown: 274, ArrowRight: 275, ArrowLeft: 276,
  Insert: 277, Home: 278, End: 279, PageUp: 280, PageDown: 281, Delete: 127,
  NumLock: 300, CapsLock: 301, ScrollLock: 302,
  ShiftRight: 303, ShiftLeft: 304, ControlRight: 305, ControlLeft: 306,
  AltRight: 307, AltLeft: 308,
};
for (let i = 1; i <= 12; i++) CODE_MAP['F' + i] = 281 + i;

export function toSDL(e) {
  const m = CODE_MAP[e.code];
  if (m !== undefined) return m;
  if (e.key && e.key.length === 1) {
    const c = e.key.toLowerCase().charCodeAt(0);
    if (c >= 32 && c < 127) return c;
  }
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3) + 32;
  if (/^Digit[0-9]$/.test(e.code)) return e.code.charCodeAt(5);
  return 0;
}

// Printable character produced by the event, or 0.  Used by the high-score
// name entry (4.2.6 accepts ASCII 32..127).
export function toUnicode(e) {
  if (e.key && e.key.length === 1) {
    const c = e.key.charCodeAt(0);
    if (c >= 32 && c < 127) return c;
  }
  return 0;
}

export const KEYNAMES = {
  8: 'backspace', 9: 'tab', 13: 'enter', 27: 'escape', 32: 'space',
  273: 'up', 274: 'down', 275: 'right', 276: 'left',
  303: 'right shift', 304: 'left shift', 305: 'right ctrl', 306: 'left ctrl',
  307: 'right alt', 308: 'left alt',
};
export function keyName(code) {
  if (KEYNAMES[code]) return KEYNAMES[code];
  if (code >= 33 && code < 127) return String.fromCharCode(code);
  return 'key ' + code;
}
