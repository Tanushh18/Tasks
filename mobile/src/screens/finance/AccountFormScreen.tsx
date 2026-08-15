import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as financeApi from "../../api/finance";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { useTheme } from "../../theme/useTheme";
import type { AccountType } from "../../types/models";
import type { FinanceStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<FinanceStackParamList, "AccountForm">;

const TYPES: AccountType[] = ["home", "office", "personal", "travel", "business", "education", "savings", "custom"];

export function AccountFormScreen({ navigation, route }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const accountId = route.params?.accountId;
  const isEditing = Boolean(accountId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<AccountType>("custom");
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      try {
        const accounts = await financeApi.listAccounts(true);
        const account = accounts.find((a) => a.id === accountId);
        if (account) {
          setName(account.name);
          setDescription(account.description);
          setType(account.type);
          setArchived(account.archived);
        }
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [accountId]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Account name is required");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (isEditing && accountId) {
        await financeApi.updateAccount(accountId, { name: name.trim(), description, type });
      } else {
        await financeApi.createAccount({ name: name.trim(), description, type });
      }
      navigation.goBack();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this account."));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!accountId) return;
    try {
      await financeApi.updateAccount(accountId, { archived: !archived });
      setArchived(!archived);
    } catch (err) {
      Alert.alert("Couldn't update account", getApiErrorMessage(err));
    }
  }

  function handleDelete() {
    if (!accountId) return;
    Alert.alert(
      "Delete account",
      "This only works if the account has no transactions. Archive it instead if you want to keep its history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await financeApi.deleteAccount(accountId);
              navigation.popToTop();
            } catch (err) {
              Alert.alert("Couldn't delete account", getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  }

  if (loading) return <LoadingState label="Loading account…" />;

  return (
    <ScreenContainer>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.lg }]}>
        {isEditing ? "Edit Account" : "New Account"}
      </Text>

      <TextField label="Account name" value={name} onChangeText={setName} placeholder="e.g. Home Expenses" />
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Type</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
        {TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={[styles.chip, { backgroundColor: type === t ? colors.primary : colors.surfaceAlt, borderRadius: radius.pill }]}
          >
            <Text style={{ color: type === t ? "#FFFFFF" : colors.textMuted, fontWeight: "600", textTransform: "capitalize" }}>
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={isEditing ? "Save changes" : "Create account"} onPress={handleSave} loading={saving} />

      {isEditing ? (
        <>
          <Button
            label={archived ? "Unarchive account" : "Archive account"}
            onPress={handleToggleArchive}
            variant="secondary"
            style={{ marginTop: spacing.md }}
          />
          <Button label="Delete account" onPress={handleDelete} variant="danger" style={{ marginTop: spacing.md }} />
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, height: 34, alignItems: "center", justifyContent: "center" },
});
