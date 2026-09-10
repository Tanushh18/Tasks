import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme/useTheme";

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Override which edges get safe-area insets. Drop "top" when a screen
   * already applies it above this container (e.g. its own AppHeader sits in
   * a SafeAreaView) — otherwise the top inset is applied twice. */
  edges?: Edge[];
}

export function ScreenContainer({
  children,
  scroll = true,
  onRefresh,
  refreshing,
  contentStyle,
  edges = ["top", "left", "right"],
}: Props) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[{ padding: spacing.lg, paddingBottom: spacing.xxl }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.flexGrow}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
});
