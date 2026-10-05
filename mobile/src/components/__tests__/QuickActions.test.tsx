import React from "react";
import { StyleSheet, View } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("@expo/vector-icons", () => {
  const { Text } = jest.requireActual("react-native");
  return { Ionicons: (props: { name: string }) => jest.requireActual("react").createElement(Text, null, `[${props.name}]`) };
});
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { QuickActions, type QuickAction } from "../QuickActions";

const actions: QuickAction[] = Array.from({ length: 8 }, (_, i) => ({
  key: `a${i}`,
  label: `Action ${i}`,
  icon: "add",
  tone: "#000",
  toneMuted: "#eee",
  onPress: jest.fn(),
}));

function render(width: number) {
  let root!: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(<QuickActions actions={actions} />);
  });
  const grid = root.root.findAllByType(View)[0];
  act(() => {
    grid.props.onLayout({ nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } });
  });
  return root;
}

function tileWidths(root: TestRenderer.ReactTestRenderer) {
  return root.root
    .findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.style === "function")
    .map((p) => {
    const style = typeof p.props.style === "function" ? p.props.style({ pressed: false }) : p.props.style;
    return StyleSheet.flatten(style).width as number;
  });
}

describe("QuickActions", () => {
  it.each([280, 320, 360, 412, 600])("fits exactly three tiles per row at %ipx wide", (width) => {
    const widths = tileWidths(render(width));
    expect(widths).toHaveLength(8);
    expect(new Set(widths).size).toBe(1);
    const gap = 12;
    // Three tiles plus two gaps never exceed the row, so a fourth can never fit beside them.
    expect(widths[0] * 3 + gap * 2).toBeLessThanOrEqual(width);
    expect(widths[0] * 4 + gap * 3).toBeGreaterThan(width);
  });
});
