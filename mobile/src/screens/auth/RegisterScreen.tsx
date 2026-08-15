import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../../components/Button";
import { PinInput } from "../../components/PinInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { useAuth } from "../../auth/AuthContext";
import { getApiErrorMessage } from "../../api/client";
import { useTheme } from "../../theme/useTheme";
import type { AuthStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { register } = useAuth();

  const [mobileNumber, setMobileNumber] = useState("");
  const [mpin, setMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = mobileNumber.trim().length >= 10 && mpin.length >= 4 && confirmMpin.length >= 4;

  async function handleSubmit() {
    setError(null);
    if (mpin !== confirmMpin) {
      setError("MPIN and confirmation do not match");
      return;
    }
    setSubmitting(true);
    try {
      await register(mobileNumber.trim(), mpin, confirmMpin);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create account. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
        <Text style={[typography.h1, { color: colors.text }]}>Create your account</Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs }]}>
          Manage tasks, reminders and finances in one place.
        </Text>
      </View>

      <TextField
        label="Mobile number"
        value={mobileNumber}
        onChangeText={(text) => setMobileNumber(text.replace(/[^\d+]/g, ""))}
        placeholder="9876543210"
        keyboardType="phone-pad"
        maxLength={16}
      />

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
          Create MPIN
        </Text>
        <PinInput value={mpin} onChangeText={setMpin} />
      </View>

      <View style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>
          Confirm MPIN
        </Text>
        <PinInput value={confirmMpin} onChangeText={setConfirmMpin} />
      </View>

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md, textAlign: "center" }]}>
          {error}
        </Text>
      ) : null}

      <Button label="Create account" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />

      <Button
        label="Already have an account? Log in"
        onPress={() => navigation.navigate("Login")}
        variant="ghost"
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
