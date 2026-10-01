/**
 * Warm, calm palette — the app should read as a family assistant, not banking software.
 *
 * Two deliberate departures from the brief's suggested colours:
 *
 * - The brief names #C9828B as "primary". White text on it lands at ~3:1, which fails WCAG AA for
 *   button-sized text (4.5:1). The deep accent #7A3E48 is used for interactive primary surfaces
 *   instead (~8.5:1 with white), and #C9828B is kept as `accent` for decorative fills, active
 *   states and highlights where it never carries small text.
 * - Finance success/danger keep their existing values. They are the established semantic pair
 *   across badges, amounts and the validated chart palette; recolouring money semantics to fit a
 *   warm theme would break both recognition and contrast.
 */

export const lightColors = {
  background: "#FAF7F5",
  surface: "#FFFFFF",
  surfaceAlt: "#F6EFEC",
  border: "#E8DEDA",

  text: "#2A2324",
  textMuted: "#64585A",
  textFaint: "#948689",

  /** Interactive primary — safe for white text. */
  primary: "#7A3E48",
  /** Decorative accent (the brief's #C9828B). Never put small text on this. */
  accent: "#C9828B",
  /** Soft accent fill for chips, selected rows, assistant bubbles. */
  primaryMuted: "#F4DDE0",
  /** Text/icon colour that sits on `primary`. */
  onPrimary: "#FFFFFF",

  success: "#15803D",
  successMuted: "#E7F6EC",
  danger: "#DC2626",
  dangerMuted: "#FDECEC",
  warning: "#B45309",
  warningMuted: "#FDF0E2",
  onDanger: "#FFFFFF",

  /** Neutral placeholder fill for skeletons while data loads. */
  skeleton: "#EFE6E2",
  overlay: "rgba(37, 26, 28, 0.45)",
};

export const darkColors: ColorPalette = {
  background: "#17120F",
  surface: "#221B18",
  surfaceAlt: "#2C2320",
  border: "#3A2F2B",

  text: "#F6EEEA",
  textMuted: "#BFAEA9",
  textFaint: "#8C7B77",

  // Inverted for dark surfaces: the light rose carries dark text at ~9:1.
  primary: "#E5A3AC",
  accent: "#C9828B",
  primaryMuted: "#3D2A2E",
  onPrimary: "#2A1519",

  success: "#4ADE80",
  successMuted: "#123320",
  danger: "#F87171",
  dangerMuted: "#3A1B1B",
  warning: "#FBBF24",
  warningMuted: "#3A2C10",
  onDanger: "#2A1010",

  skeleton: "#312723",
  overlay: "rgba(0, 0, 0, 0.6)",
};

/**
 * "Midnight": a true-black theme for OLED screens and night use. Neutral greys instead of the warm
 * browns of `darkColors`, the same rose brand accent, and pure black behind everything so unlit
 * pixels stay off.
 */
export const midnightColors: ColorPalette = {
  background: "#000000",
  surface: "#0F0F11",
  surfaceAlt: "#19191C",
  border: "#2A2A2E",

  text: "#F4F4F5",
  textMuted: "#A9A9B2",
  textFaint: "#74747D",

  primary: "#E5A3AC",
  accent: "#C9828B",
  primaryMuted: "#2B1C20",
  onPrimary: "#2A1519",

  success: "#4ADE80",
  successMuted: "#0F2A1A",
  danger: "#F87171",
  dangerMuted: "#331616",
  warning: "#FBBF24",
  warningMuted: "#2E2410",
  onDanger: "#2A1010",

  skeleton: "#1C1C20",
  overlay: "rgba(0, 0, 0, 0.72)",
};

export type ColorPalette = typeof lightColors;

/** Note card backgrounds: pastels on light, deep tints on the dark themes so light text stays readable. */
export const lightNoteTints = {
  peach: "#FBE3D3",
  sage: "#E1EBD9",
  sky: "#DDEAF3",
  lavender: "#E7E1F2",
  sand: "#F1E9D8",
};

export const darkNoteTints: typeof lightNoteTints = {
  peach: "#3A2A20",
  sage: "#26301F",
  sky: "#1E2A35",
  lavender: "#2B2538",
  sand: "#352E20",
};
