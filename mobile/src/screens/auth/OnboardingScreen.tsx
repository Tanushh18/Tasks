import React, { useRef, useState } from "react";
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/useTheme";

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "home-outline",
    title: "Your family's private space.",
    body: "A place just for the people you trust, kept off the public internet.",
  },
  {
    icon: "layers-outline",
    title: "Stay organized together.",
    body: "Tasks, money, notes and communication in one place.",
  },
  {
    icon: "cloud-offline-outline",
    title: "Works even when you're offline.",
    body: "Everything you add is saved on your device and syncs when you're back online.",
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Props {
  onCreateFamily: () => void;
  onJoinFamily: () => void;
}

/**
 * Shown once per device install, before the auth screens. A ScrollView with pagingEnabled
 * is enough for three slides — pulling in a carousel library for this would be overkill.
 */
export function OnboardingScreen({ onCreateFamily, onJoinFamily }: Props) {
  const { colors, spacing, typography, touchTarget } = useTheme();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index) setIndex(next);
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.flex}
        accessibilityRole="adjustable"
        accessibilityLabel="Onboarding slides"
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width: SCREEN_WIDTH, padding: spacing.xl }]}>
            <Ionicons name={slide.icon} size={72} color={colors.primary} style={{ marginBottom: spacing.xl }} />
            <Text style={[typography.h1, { color: colors.text, textAlign: "center" }]}>{slide.title}</Text>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center", marginTop: spacing.md },
              ]}
            >
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((slide, i) => (
          <View
            key={slide.title}
            style={[
              styles.dot,
              {
                backgroundColor: i === index ? colors.primary : colors.border,
                width: i === index ? 20 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        <Button
          label="Create Family"
          onPress={onCreateFamily}
          accessibilityLabel="Create Family"
          accessibilityHint="Starts registration for a new family"
        />
        <Button
          label="Join Family"
          onPress={onJoinFamily}
          variant="secondary"
          style={{ marginTop: spacing.md, minHeight: touchTarget.comfortable }}
          accessibilityLabel="Join Family"
          accessibilityHint="Takes you to the login screen"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  slide: { alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 8 },
  dot: { height: 8, borderRadius: 4 },
});
