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
  background: "#FFF9F5",
  surface: "#FFFFFF",
  surfaceAlt: "#FDF1EE",
  border: "#EFE0DC",

  text: "#332C2D",
  textMuted: "#6E5F61",
  textFaint: "#9C8C8E",

  /** Interactive primary — safe for white text. */
  primary: "#7A3E48",
  /** Decorative accent (the brief's #C9828B). Never put small text on this. */
  accent: "#C9828B",
  /** Soft accent fill for chips, selected rows, assistant bubbles. */
  primaryMuted: "#F4DDE0",
  /** Text/icon colour that sits on `primary`. */
  onPrimary: "#FFFFFF",

  success: "#16A34A",
  successMuted: "#E9F9EF",
  danger: "#DC2626",
  dangerMuted: "#FDECEC",
  warning: "#B45309",
  warningMuted: "#FDF0E2",
  onDanger: "#FFFFFF",

  /** Neutral placeholder fill for skeletons while data loads. */
  skeleton: "#F0E4E0",
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

export type ColorPalette = typeof lightColors;
