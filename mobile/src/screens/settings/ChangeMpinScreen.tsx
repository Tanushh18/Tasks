import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as authApi from "../../api/auth";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { PinInput } from "../../components/PinInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useTheme } from "../../theme/useTheme";
import type { SettingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SettingsStackParamList, "ChangeMpin">;

export function ChangeMpinScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();

  const [currentMpin, setCurrentMpin] = useState("");
  const [newMpin, setNewMpin] = useState("");
  const [confirmNewMpin, setConfirmNewMpin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = currentMpin.length >= 4 && newMpin.length >= 4 && confirmNewMpin.length >= 4;

  async function handleSubmit() {
    setError(null);
    if (newMpin !== confirmNewMpin) {
      setError("New MPIN and confirmation do not match");
      return;
    }
    setSaving(true);
    try {
      await authApi.changeMpin(currentMpin, newMpin, confirmNewMpin);
      Alert.alert("MPIN updated", "Your MPIN has been changed.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not change MPIN."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.xl }]}>Change MPIN</Text>

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Current MPIN</Text>
        <PinInput value={currentMpin} onChangeText={setCurrentMpin} />
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>New MPIN</Text>
        <PinInput value={newMpin} onChangeText={setNewMpin} />
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>Confirm new MPIN</Text>
        <PinInput value={confirmNewMpin} onChangeText={setConfirmNewMpin} />
      </View>

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md, textAlign: "center" }]}>{error}</Text>
      ) : null}

      <Button label="Update MPIN" onPress={handleSubmit} disabled={!canSubmit} loading={saving} />
    </ScreenContainer>
  );
}
