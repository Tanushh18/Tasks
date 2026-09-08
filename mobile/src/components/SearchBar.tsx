import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../theme/useTheme";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Shown while a debounced query is in flight. */
  loading?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}

/** The one search input used across Contacts, Notes, Tasks and global search. */
export function SearchBar({ value, onChangeText, placeholder = "Search", loading, autoFocus, onSubmitEditing }: Props) {
  const { colors, spacing, radius, touchTarget } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          minHeight: touchTarget.comfortable,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        style={[styles.input, { color: colors.text, minHeight: touchTarget.comfortable }]}
      />
      {loading ? <ActivityIndicator size="small" color={colors.textFaint} /> : null}
      {!loading && value ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  input: { flex: 1, fontSize: 16 },
});
