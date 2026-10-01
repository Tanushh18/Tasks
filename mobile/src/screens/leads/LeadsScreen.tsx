import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getApiErrorMessage } from "../../api/client";
import * as api from "../../api/leads";
import { Card } from "../../components/Card";
import { EmptyState, ErrorState } from "../../components/StateViews";
import { SkeletonLines } from "../../components/Skeleton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";

export function LeadsScreen({ navigation }: any) {
  const { colors, spacing, typography, radius, touchTarget } = useTheme();
  const [leads, setLeads] = useState<api.Lead[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeads(await api.listLeads(search));
    } catch (e) {
      setError(getApiErrorMessage(e, "We couldn't load your leads."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Leads are shared: quietly pick up edits made by other people on the same sheet.
      const timer = setInterval(() => {
        api.listLeads(search).then(setLeads).catch(() => {});
      }, 20000);
      return () => clearInterval(timer);
    }, [load, search])
  );

  const callLead = async (phone: string | undefined | null) => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!digits) {
      Alert.alert("Invalid number", "This lead does not have a valid phone number.");
      return;
    }
    try {
      await Linking.openURL(`tel:+${digits.startsWith("91") ? digits : "91" + digits}`);
    } catch {
      Alert.alert("Unable to open dialer", "No phone app is available to handle this number.");
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.syncLeads();
      await load();
    } catch (e) {
      Alert.alert("Sync failed", getApiErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View>
          <Text style={[typography.h1, { color: colors.text }]}>Leads</Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{leads.length} active leads</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 18 }}>
          <Pressable onPress={() => navigation.navigate("LeadSources")}>
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={sync} disabled={syncing}>
            <Ionicons name="sync" size={24} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.search,
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
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone or status"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text }]}
        />
      </View>

      {loading ? (
        <SkeletonLines count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{
            paddingVertical: spacing.md,
            paddingBottom: 40,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <EmptyState
              title="No leads yet"
              subtitle="Open the sheet icon to connect a Google Sheet."
              icon="people-outline"
            />
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={[typography.bodyStrong, { color: colors.text }]}>
                {item.name || "Unnamed lead"}
              </Text>
              <View style={styles.phoneRow}>
                <Text style={[typography.body, { color: colors.textMuted, marginTop: 4 }]}>
                  {item.phone}
                </Text>
                <Pressable
                  onPress={() => void callLead(item.phone)}
                  style={[styles.callButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${item.name || "lead"}`}
                >
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={styles.callText}>Call</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <Text style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>
                  {item.category || "Uncategorised"}
                </Text>
                <Text style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>
                  {item.status || "New"}
                </Text>
                {item.plotInFarukhNagar ? (
                  <Text
                    style={[styles.pill, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
                  >
                    Plot: {item.plotInFarukhNagar}
                  </Text>
                ) : null}
              </View>
              {item.requirement || item.address || item.budget || item.notes ? (
                <Text style={[typography.caption, { color: colors.textMuted, marginTop: 8 }]}>
                  {[item.requirement, item.address, item.budget, item.notes].filter(Boolean).join(" • ")}
                </Text>
              ) : null}
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  callText: {
    color: "#fff",
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
  },
});
