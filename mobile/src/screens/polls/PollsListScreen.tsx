import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiErrorMessage } from "../../api/client";
import * as pollsApi from "../../api/polls";
import { Card } from "../../components/Card";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { PollsStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<PollsStackParamList, "PollsList">;

type Tab = "active" | "closed";

export function PollsListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget, shadow } = useTheme();

  const [tab, setTab] = useState<Tab>("active");
  const [polls, setPolls] = useState<pollsApi.Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: Tab) => {
    setError(null);
    try {
      setPolls(await pollsApi.listPolls(status));
    } catch (err) {
      setError(getApiErrorMessage(err, "We couldn't load polls."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(tab);
    }, [load, tab])
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          Family Polls
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: 2 }]}>
          Ask a quick question and see what everyone thinks.
        </Text>

        <View style={[styles.tabs, { marginTop: spacing.lg, backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}>
          {(["active", "closed"] as Tab[]).map((option) => {
            const selected = option === tab;
            return (
              <Pressable
                key={option}
                onPress={() => setTab(option)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={option === "active" ? "Active polls" : "Closed polls"}
                style={[
                  styles.tab,
                  {
                    backgroundColor: selected ? colors.primary : "transparent",
                    borderRadius: radius.md,
                    minHeight: touchTarget.min,
                  },
                ]}
              >
                <Text style={[typography.captionStrong, { color: selected ? colors.onPrimary : colors.textMuted }]}>
                  {option === "active" ? "Active" : "Closed"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonLines count={4} />
        </View>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load(tab);
          }}
        />
      ) : polls.length === 0 ? (
        <EmptyState
          title={tab === "active" ? "No active polls" : "No closed polls yet"}
          subtitle={tab === "active" ? "Ask the family a quick question." : "Polls appear here once they're closed."}
          icon="stats-chart-outline"
          tone={colors.primary}
          toneMuted={colors.primaryMuted}
          actionLabel={tab === "active" ? "New poll" : undefined}
          onAction={tab === "active" ? () => navigation.navigate("PollForm") : undefined}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 96, flexGrow: 1 }}>
          {polls.map((poll) => (
            <Pressable
              key={poll.id}
              onPress={() => navigation.navigate("PollDetail", { pollId: poll.id })}
              accessibilityRole="button"
              accessibilityLabel={`Open poll: ${poll.question}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{poll.question}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                      {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
                      {poll.createdBy ? ` · by ${poll.createdBy.name}` : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={() => navigation.navigate("PollForm")}
        accessibilityRole="button"
        accessibilityLabel="New poll"
        style={({ pressed }) => [
          styles.fab,
          shadow.raised,
          {
            backgroundColor: colors.primary,
            borderRadius: radius.pill,
            minHeight: touchTarget.large,
            paddingHorizontal: spacing.xl,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Ionicons name="add" size={22} color={colors.onPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.onPrimary, marginLeft: spacing.xs }]}>New poll</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tabs: { flexDirection: "row", padding: 4 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  fab: { position: "absolute", right: 20, bottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "center" },
});
