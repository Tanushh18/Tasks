import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getApiErrorMessage } from "../../api/client";
import * as searchApi from "../../api/search";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonLines } from "../../components/Skeleton";
import { EmptyState, ErrorState } from "../../components/StateViews";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel } from "../../utils/date";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "Search">,
  BottomTabScreenProps<MainTabParamList>
>;

const DEBOUNCE_MS = 300;

export function SearchScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<searchApi.SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Debouncing alone does not prevent out-of-order results: two requests can still be in flight
   * when typing resumes mid-request, and the slower (older) one can land last and overwrite the
   * newer answer. Each request carries a sequence number and only the newest may write state.
   */
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestSeq.current += 1; // Invalidate anything in flight.
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const seq = ++requestSeq.current;
      try {
        const res = await searchApi.globalSearch(trimmed);
        if (seq !== requestSeq.current) return;
        setResults(res);
        setError(null);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(getApiErrorMessage(err, "We couldn't search just now."));
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const totalResults = useMemo(() => {
    if (!results) return 0;
    return results.tasks.length + results.transactions.length + results.accounts.length + results.contacts.length;
  }, [results]);

  return (
    <ScreenContainer scroll>
      <View style={[styles.searchRow, { marginBottom: spacing.lg }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{ minWidth: touchTarget.min, minHeight: touchTarget.min, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              minHeight: touchTarget.comfortable,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="What are you looking for?"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search your tasks, money entries and accounts"
            returnKeyType="search"
            style={[styles.input, { color: colors.text, minHeight: touchTarget.comfortable }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <SkeletonLines count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setQuery((current) => `${current} `.trim())} />
      ) : !query.trim() ? (
        <EmptyState
          title="Search everything"
          subtitle="Find a task, a money entry or an account by name."
        />
      ) : totalResults === 0 ? (
        <EmptyState
          title="Nothing matched that"
          subtitle={`No results for "${query.trim()}".`}
          actionLabel="Clear search"
          onAction={() => setQuery("")}
        />
      ) : (
        <View>
          {results!.tasks.length > 0 ? (
            <ResultGroup title="Tasks" count={results!.tasks.length}>
              {results!.tasks.map((task) => (
                <ResultRow
                  key={task.id}
                  icon="checkbox-outline"
                  title={task.title}
                  subtitle={`${formatDateLabel(task.date)} · ${formatTimeLabel(task.time)}`}
                  onPress={() =>
                    navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId: task.id } })
                  }
                />
              ))}
            </ResultGroup>
          ) : null}

          {results!.accounts.length > 0 ? (
            <ResultGroup title="Accounts" count={results!.accounts.length}>
              {results!.accounts.map((account) => (
                <ResultRow
                  key={account.id}
                  icon="wallet-outline"
                  title={account.name}
                  subtitle={account.type}
                  onPress={() =>
                    navigation.navigate("FinanceTab", { screen: "AccountDetail", params: { accountId: account.id } })
                  }
                />
              ))}
            </ResultGroup>
          ) : null}

          {results!.contacts.length > 0 ? (
            <ResultGroup title="Contacts" count={results!.contacts.length}>
              {results!.contacts.map((contact) => (
                <ResultRow
                  key={contact.id}
                  icon="person-outline"
                  title={contact.name}
                  subtitle={contact.number}
                  onPress={() =>
                    navigation.navigate("FamilyTab", { screen: "ContactForm", params: { contactId: contact.id } })
                  }
                />
              ))}
            </ResultGroup>
          ) : null}

          {results!.transactions.length > 0 ? (
            <ResultGroup title="Money entries" count={results!.transactions.length}>
              {results!.transactions.map((txn) => (
                <ResultRow
                  key={txn.id}
                  icon={txn.type === "IN" ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
                  title={txn.category}
                  subtitle={formatDateLabel(txn.date)}
                  trailing={`${txn.type === "IN" ? "+" : "-"}${formatCurrency(txn.amount)}`}
                  trailingColor={txn.type === "IN" ? colors.success : colors.danger}
                  onPress={() =>
                    navigation.navigate("FinanceTab", { screen: "AccountDetail", params: { accountId: txn.accountId } })
                  }
                />
              ))}
            </ResultGroup>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text
        accessibilityRole="header"
        style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}
      >
        {title} ({count})
      </Text>
      {children}
    </View>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  trailing,
  trailingColor,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  trailing?: string;
  trailingColor?: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, typography, touchTarget } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}${trailing ? `, ${trailing}` : ""}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <Card style={{ marginBottom: spacing.sm, minHeight: touchTarget.large }}>
        <View style={styles.resultRow}>
          <View
            style={[
              styles.resultIcon,
              { backgroundColor: colors.primaryMuted, borderRadius: radius.md, marginRight: spacing.md },
            ]}
          >
            <Ionicons name={icon} size={18} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2, textTransform: "capitalize" }]}>
              {subtitle}
            </Text>
          </View>
          {trailing ? (
            <Text style={[typography.bodyStrong, { color: trailingColor ?? colors.text, marginLeft: spacing.sm }]}>
              {trailing}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, fontSize: 16 },
  resultRow: { flexDirection: "row", alignItems: "center" },
  resultIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
