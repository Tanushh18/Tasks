/**
 * Per-module accent colours.
 *
 * Each feature area gets one identity hue, used for icons, module headers and
 * small accent fills so a screen is recognisable at a glance. The warm rose
 * `primary` stays the single brand accent for interactive elements (buttons,
 * links, selected states) — these are for *identity*, not for actions.
 *
 * Two rules these must obey:
 *
 * - **Never colour-alone.** Every place a feature colour appears, a label or
 *   icon carries the same meaning (spec §37). These hues distinguish modules
 *   for people who can already tell them apart; they never encode the only
 *   copy of a fact.
 * - **Contrast.** Light values are AA (≥4.5:1) against the light surfaces
 *   (#FFFFFF / #FFF9F5); dark values are well above AA against the dark
 *   surfaces (#221B18 / #17120F). The `*Muted` fills are backgrounds only —
 *   text placed on them uses the matching solid value.
 */

export type FeatureName =
  | "tasks"
  | "finance"
  | "chat"
  | "location"
  | "notes"
  | "contacts"
  | "ai";

interface FeatureColor {
  /** Solid — safe for icons and text on the module's surface. */
  solid: string;
  /** Soft background fill for chips, icon tiles and selected rows. */
  muted: string;
}

export const lightFeatureColors: Record<FeatureName, FeatureColor> = {
  tasks: { solid: "#4F46E5", muted: "#EEF0FE" },
  finance: { solid: "#0F766E", muted: "#E6F4F2" },
  chat: { solid: "#0369A1", muted: "#E4F1F9" },
  location: { solid: "#C2410C", muted: "#FCEDE6" },
  notes: { solid: "#A16207", muted: "#FAF2E1" },
  contacts: { solid: "#BE185D", muted: "#FCE8F0" },
  ai: { solid: "#7C3AED", muted: "#F1EAFE" },
};

export const darkFeatureColors: Record<FeatureName, FeatureColor> = {
  tasks: { solid: "#A5B4FC", muted: "#232544" },
  finance: { solid: "#5EEAD4", muted: "#14322F" },
  chat: { solid: "#7DD3FC", muted: "#152B3A" },
  location: { solid: "#FDBA74", muted: "#3A2517" },
  notes: { solid: "#FDE047", muted: "#332B10" },
  contacts: { solid: "#F9A8D4", muted: "#3A1B2B" },
  ai: { solid: "#C4B5FD", muted: "#2A2140" },
};

export type FeatureColorPalette = Record<FeatureName, FeatureColor>;
