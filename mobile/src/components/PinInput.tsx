import React, { useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  autoFocus?: boolean;
}

export function PinInput({ value, onChangeText, length = 4, autoFocus }: Props) {
  const { colors, radius } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  return (
    <View style={styles.wrapper}>
      {digits.map((digit, index) => (
        <View
          key={index}
          style={[
            styles.box,
            {
              borderColor: value.length === index ? colors.primary : colors.border,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
            },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: digit ? colors.text : "transparent" }]} />
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        style={styles.hiddenInput}
        // Overlay a real TextInput to drive the OS keyboard while the boxes above render the visual state.
        caretHidden
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    position: "relative",
  },
  box: {
    width: 52,
    height: 56,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
});
