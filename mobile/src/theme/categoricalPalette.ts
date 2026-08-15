/**
 * Validated 8-hue categorical palette for multi-series charts (account/category breakdowns).
 * Order matters — it's the CVD-safety mechanism, not cosmetic. Verified with the dataviz skill's
 * validate_palette.js against this app's actual light/dark chart surfaces:
 *   light (#FFFFFF): all hard gates pass; aqua/yellow/magenta fall under 3:1 contrast, mitigated
 *     by always pairing bars with a direct text label (never color-alone identity).
 *   dark (#191B23): all checks pass including contrast.
 * Do not reorder or add hues without re-running the validator — see dataviz skill palette.md.
 */
export const categoricalLight = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export const categoricalDark = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

export function getCategoricalColor(index: number, isDark: boolean): string {
  const ramp = isDark ? categoricalDark : categoricalLight;
  return ramp[index % ramp.length];
}

export interface Bucketed<T> {
  label: string;
  value: number;
  original?: T;
}

/**
 * Caps a series to the top N entries by value, folding the remainder into "Other" — per the
 * palette's series-count ladder (past ~7-8 slots, fold the tail rather than generate more hues).
 */
export function bucketTopN<T>(items: T[], getLabel: (item: T) => string, getValue: (item: T) => number, topN = 6): Bucketed<T>[] {
  const sorted = [...items].sort((a, b) => getValue(b) - getValue(a));
  const top = sorted.slice(0, topN).map((item) => ({ label: getLabel(item), value: getValue(item), original: item }));
  const rest = sorted.slice(topN);
  const restTotal = rest.reduce((sum, item) => sum + getValue(item), 0);
  return restTotal > 0 ? [...top, { label: "Other", value: restTotal }] : top;
}
