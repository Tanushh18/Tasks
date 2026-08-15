import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as searchApi from "../../api/search";
import { getApiErrorMessage } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState, LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";
import { formatCurrency } from "../../utils/currency";
import { formatDateLabel, formatTimeLabel } from "../../utils/date";
import type { HomeStackParamList, MainTabParamList } from "../../navigation/types";

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, "Search">,
  BottomTabScreenProps<MainTabParamList>
>;

export function SearchScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<searchApi.SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchApi.globalSearch(trimmed);
        setResults(res);
      } catch (err) {
        setError(getApiErrorMessage(err, "Search failed."));
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasResults = results && (results.tasks.length || results.transactions.length || results.accounts.length);

  return (
    <ScreenContainer scroll={false}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ marginRight: spacing.sm }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            height: 44,
          }}
        >
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks, transactions, accounts…"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, marginLeft: 8, fontSize: 15, color: colors.text, height: 44 }}
          />
        </View>
      </View>

      {loading ? (
        <LoadingState label="Searching…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !query.trim() ? (
        <EmptyState title="Search everything" subtitle="Find tasks, transactions, and accounts by keyword." />
      ) : !hasResults ? (
        <EmptyState title="No results" subtitle={`Nothing matched "${query.trim()}".`} />
      ) : (
        <View>
          {results!.tasks.length > 0 ? (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Tasks</Text>
              {results!.tasks.map((task) => (
                <Pressable key={task.id} onPress={() => navigation.navigate("TasksTab", { screen: "TaskForm", params: { taskId: task.id } })}>
                  <Card style={{ marginBottom: spacing.sm }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{task.title}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {formatDateLabel(task.date)} · {formatTimeLabel(task.time)}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : null}

          {results!.accounts.length > 0 ? (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Accounts</Text>
              {results!.accounts.map((account) => (
                <Pressable key={account.id} onPress={() => navigation.navigate("FinanceTab", { screen: "AccountDetail", params: { accountId: account.id } })}>
                  <Card style={{ marginBottom: spacing.sm }}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{account.name}</Text>
                    <Text style={[typography.caption, { color: colors.textMuted, textTransform: "capitalize" }]}>{account.type}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : null}

          {results!.transactions.length > 0 ? (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Transactions</Text>
              {results!.transactions.map((txn) => (
                <Pressable
                  key={txn.id}
                  onPress={() => navigation.navigate("FinanceTab", { screen: "AccountDetail", params: { accountId: txn.accountId } })}
                >
                  <Card style={{ marginBottom: spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodyStrong, { color: colors.text }]}>{txn.category}</Text>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{formatDateLabel(txn.date)}</Text>
                    </View>
                    <Text style={[typography.bodyStrong, { color: txn.type === "IN" ? colors.success : colors.danger }]}>
                      {txn.type === "IN" ? "+" : "-"}
                      {formatCurrency(txn.amount)}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </ScreenContainer>
  );
}
