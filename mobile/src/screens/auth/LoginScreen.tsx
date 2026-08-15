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

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { login } = useAuth();

  const [mobileNumber, setMobileNumber] = useState("");
  const [mpin, setMpin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = mobileNumber.trim().length >= 10 && mpin.length >= 4;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(mobileNumber.trim(), mpin);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not log in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xl }}>
        <Text style={[typography.h1, { color: colors.text }]}>Welcome back</Text>
        <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.xs }]}>
          Log in with your mobile number and MPIN.
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
        <Text style={[typography.captionStrong, { color: colors.textMuted, marginBottom: spacing.sm }]}>MPIN</Text>
        <PinInput value={mpin} onChangeText={setMpin} />
      </View>

      {error ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md, textAlign: "center" }]}>
          {error}
        </Text>
      ) : null}

      <Button label="Log in" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />

      <Button
        label="New here? Create an account"
        onPress={() => navigation.navigate("Register")}
        variant="ghost"
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
