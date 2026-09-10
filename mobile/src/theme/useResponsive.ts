import { useWindowDimensions } from "react-native";

/** Below this, phones (including large ones in landscape); at or above, treat
 * as tablet-class — enough room for two columns without cramming. */
const TABLET_BREAKPOINT = 700;

export interface Responsive {
  width: number;
  isTablet: boolean;
  /** How many columns a widget/card grid should use right now. */
  columns: 1 | 2;
}

/**
 * The one place screen width is read from. Centralising it means a future
 * breakpoint change (or a foldable/split-screen edge case) is a one-line fix
 * instead of a hunt through every screen that cares about tablet layout.
 */
export function useResponsive(): Responsive {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  return { width, isTablet, columns: isTablet ? 2 : 1 };
}
