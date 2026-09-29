import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/useTheme";
import { getBiometricCapability, promptBiometric } from "../../auth/useBiometrics";

interface Props {
  onUnlocked: () => void;
  onUseMpin: () => void;
}

export function BiometricLockScreen({ onUnlocked, onUseMpin }: Props) {
  const { colors, spacing, typography } = useTheme();
  const [label, setLabel] = useState("Biometrics");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBiometricCapability().then((c) => setLabel(c.label)).catch(() => undefined);
    // Auto-prompt on mount
    void authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authenticate() {
    setBusy(true);
    setError(null);
    try {
      const success = await promptBiometric(`Unlock with ${label}`);
      if (success) {
        onUnlocked();
      } else {
        setError("Authentication cancelled. Try again or use your MPIN.");
      }
    } catch {
      setError("Biometric authentication failed. Try again or use your MPIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xl,
      }}
    >
      <Text style={[typography.h1, { color: colors.text, textAlign: "center", marginBottom: spacing.sm }]}>
        Welcome back
      </Text>
      <Text
        style={[typography.body, { color: colors.textMuted, textAlign: "center", marginBottom: spacing.xxl }]}
      >
        Verify your identity to continue.
      </Text>

      {busy ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.xl }} />
      ) : null}

      {error ? (
        <Text
          style={[
            typography.caption,
            { color: colors.danger, textAlign: "center", marginBottom: spacing.lg },
          ]}
        >
          {error}
        </Text>
      ) : null}

      <Button
        label={`Use ${label}`}
        onPress={authenticate}
        loading={busy}
        style={{ width: "100%", marginBottom: spacing.md }}
      />

      <Button
        label="Use MPIN instead"
        onPress={onUseMpin}
        variant="ghost"
        style={{ width: "100%" }}
      />
    </View>
  );
}
