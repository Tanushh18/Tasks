export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

/**
 * Minimum interactive sizes. `min` is the accessibility floor (44pt); `comfortable` is the default
 * for ordinary buttons and list rows; `large` is for the actions a parent reaches for most —
 * Add Task, Add Expense, Confirm, and the microphone.
 */
export const touchTarget = {
  min: 44,
  comfortable: 48,
  large: 56,
};

/**
 * Type scale. Sizes are a step up from typical mobile defaults because the primary audience
 * includes users who prefer larger text; `lineHeight` is set everywhere so text stays readable
 * when the OS font scale is increased.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" as const },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: "400" as const },
  captionStrong: { fontSize: 14, lineHeight: 19, fontWeight: "600" as const },
  /** Money figures — tabular so columns of amounts line up. */
  amount: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
};

export const shadow = {
  card: {
    shadowColor: "#3A2F2B",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#3A2F2B",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};
