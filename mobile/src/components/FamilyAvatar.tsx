import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";

export type PresenceStatus = "online" | "offline" | "sharing-location";

interface Props {
  name: string;
  size?: number;
  /** Small dot on the corner. Always paired with text elsewhere in the row. */
  presence?: PresenceStatus;
}

/** Deterministic tint per person, so the same face keeps the same colour everywhere. */
const AVATAR_TINTS = ["#4F46E5", "#0F766E", "#BE185D", "#C2410C", "#7C3AED", "#0369A1"] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

export function FamilyAvatar({ name, size = 44, presence }: Props) {
  const { colors, isDark } = useTheme();
  const tint = tintFor(name);
  const dotSize = Math.max(10, Math.round(size * 0.26));

  const presenceColor =
    presence === "online" ? colors.success : presence === "sharing-location" ? colors.warning : colors.textFaint;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            // A translucent tint keeps these calm rather than saturated blocks.
            backgroundColor: isDark ? `${tint}33` : `${tint}1F`,
          },
        ]}
      >
        <Text
          accessibilityElementsHidden
          style={{ color: tint, fontSize: Math.round(size * 0.36), fontWeight: "700" }}
        >
          {initialsOf(name)}
        </Text>
      </View>

      {presence ? (
        <View
          style={[
            styles.presence,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: presenceColor,
              borderColor: colors.surface,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Overlapping row of avatars, e.g. "who's in this group". */
export function AvatarStack({ names, size = 32, max = 4 }: { names: string[]; size?: number; max?: number }) {
  const { colors, typography } = useTheme();
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <View style={styles.stack} accessibilityLabel={names.join(", ")}>
      {shown.map((name, index) => (
        <View key={`${name}-${index}`} style={{ marginLeft: index === 0 ? 0 : -size * 0.3 }}>
          <FamilyAvatar name={name} size={size} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.3,
              backgroundColor: colors.surfaceAlt,
            },
          ]}
        >
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: "700" }]}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  presence: { position: "absolute", right: -1, bottom: -1, borderWidth: 2 },
  stack: { flexDirection: "row", alignItems: "center" },
});
