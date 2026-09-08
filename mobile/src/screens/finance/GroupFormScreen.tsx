import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import * as groupExpenseApi from "../../api/groupExpenses";
import { getApiErrorMessage } from "../../api/client";
import type { UserSearchResult } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/StateViews";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { UserPicker } from "../../components/UserPicker";
import type { FinanceStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<FinanceStackParamList, "GroupForm">;

export function GroupFormScreen({ route, navigation }: Props) {
  const { groupId } = route.params ?? {};
  const { colors, spacing, typography } = useTheme();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [members, setMembers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(Boolean(groupId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: groupId ? "Edit group" : "New group" });
  }, [navigation, groupId]);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const group = await groupExpenseApi.getGroup(groupId);
        setName(group.name);
        setMembers(group.members.filter((m) => m.id !== user?.id).map((m) => ({ id: m.id, name: m.name })));
      } catch (err) {
        setError(getApiErrorMessage(err, "We couldn't load this group."));
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, user?.id]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Give the group a name", "For example, \"Goa Trip\" or \"Flat 3B\".");
      return;
    }
    setSaving(true);
    try {
      const memberIds = members.map((m) => m.id);
      if (groupId) {
        await groupExpenseApi.updateGroup(groupId, { name: trimmed, memberIds });
      } else {
        await groupExpenseApi.createGroup({ name: trimmed, memberIds });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("We couldn't save this group", getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading group…" />;

  return (
    <ScreenContainer>
      <TextField label="Group name" value={name} onChangeText={setName} placeholder="e.g. Goa Trip" maxLength={80} />

      <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.xs }]}>
        Members (you're always included)
      </Text>
      <UserPicker
        mode="multi"
        value={members}
        onChange={setMembers}
        excludeIds={user ? [user.id] : []}
        placeholder="Add people by name"
      />

      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text> : null}

      <Button
        label={groupId ? "Save changes" : "Create group"}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: spacing.xl }}
      />
    </ScreenContainer>
  );
}
