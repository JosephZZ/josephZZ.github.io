// Action codes.  Action 0 is always "no action" and is never consumed (4.2.4).
export const A_NOACTION = 0;
export const A_P1UP = 1, A_P1DOWN = 2, A_P1LEFT = 3, A_P1RIGHT = 4, A_P1EXTRA = 5;
export const A_P2UP = 6, A_P2DOWN = 7, A_P2LEFT = 8, A_P2RIGHT = 9, A_P2EXTRA = 10;
// 4.2.5 - bound after a Game Over; it deliberately does nothing.
export const A_QUITLOSE = 11;
export const A_SPACE = 12, A_ENTER = 13;
export const A_MENUUP = 14, A_MENUDOWN = 15, A_MENULEFT = 16, A_MENURIGHT = 17;
