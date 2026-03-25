/** World-space placement of the main A4 stack on the infinite canvas (shared with action toolbar). */
export const MAIN_PAGE_STACK_LEFT = 100;
export const MAIN_PAGE_STACK_TOP = 400;

/** Toolbar sits just above the first sheet (same `left` as stack). */
export const ACTION_TOOLBAR_GAP_ABOVE_STACK = 10;
export const ACTION_TOOLBAR_ROW_HEIGHT = 36;
export const ACTION_TOOLBAR_TOP =
  MAIN_PAGE_STACK_TOP - ACTION_TOOLBAR_GAP_ABOVE_STACK - ACTION_TOOLBAR_ROW_HEIGHT;
