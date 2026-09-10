import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { useTheme } from "../../theme/useTheme";
import { WIDGET_DEFINITIONS, getWidgetPrefs, moveWidget, setWidgetPrefs, type WidgetPrefs } from "../../home/widgets";

/**
 * Reorder/show-hide for Home's secondary sections. Up/down buttons rather
 * than drag-and-drop — reliable with a screen reader and with a single
 * finger, where a long-press drag gesture is neither (spec §37, §41).
 */
export function CustomizeHomeScreen() {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  const [prefs, setPrefs] = useState<WidgetPrefs | null>(null);

  useEffect(() => {
    getWidgetPrefs().then(setPrefs);
  }, []);

  const persist = useCallback((next: WidgetPrefs) => {
    setPrefs(next);
    void setWidgetPrefs(next);
  }, []);

  if (!prefs) return null;

  return (
    <ScreenContainer edges={["left", "right"]}>
      <SectionHeader
        title="Customize Home"
        subtitle="Reorder or hide sections. Quick Actions always stay at the top."
      />

      {prefs.order.map((id, index) => {
        const def = WIDGET_DEFINITIONS.find((w) => w.id === id);
        if (!def) return null;
        const hidden = prefs.hidden.includes(id);
        return (
          <Card key={id} style={{ marginBottom: spacing.sm, opacity: hidden ? 0.5 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyStrong, { color: colors.text }]}>{def.label}</Text>
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{def.description}</Text>
              </View>

              <View style={{ flexDirection: "column" }}>
                <Pressable
                  onPress={() => persist({ ...prefs, order: moveWidget(prefs.order, id, "up") })}
                  disabled={index === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${def.label} up`}
                  hitSlop={4}
                  style={{ opacity: index === 0 ? 0.3 : 1, minWidth: touchTarget.min, minHeight: touchTarget.min / 2, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => persist({ ...prefs, order: moveWidget(prefs.order, id, "down") })}
                  disabled={index === prefs.order.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${def.label} down`}
                  hitSlop={4}
                  style={{
                    opacity: index === prefs.order.length - 1 ? 0.3 : 1,
                    minWidth: touchTarget.min,
                    minHeight: touchTarget.min / 2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </Pressable>
              </View>

              <Switch
                value={!hidden}
                onValueChange={(visible) =>
                  persist({
                    ...prefs,
                    hidden: visible ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id],
                  })
                }
                accessibilityLabel={`Show ${def.label} on Home`}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </Card>
        );
      })}
    </ScreenContainer>
  );
}
