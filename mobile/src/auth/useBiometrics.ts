import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useState } from "react";

export interface BiometricCapability {
  available: boolean;
  /** e.g. "Face ID", "Fingerprint", "Biometrics" */
  label: string;
  /** The best AuthenticationType available, or null if none. */
  type: LocalAuthentication.AuthenticationType | null;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { available: false, label: "Biometrics", type: null };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return { available: false, label: "Biometrics", type: null };

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const type = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ? LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ? LocalAuthentication.AuthenticationType.FINGERPRINT
    : types[0] ?? null;

  const label =
    type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      ? "Face ID"
      : type === LocalAuthentication.AuthenticationType.FINGERPRINT
      ? "Fingerprint"
      : "Biometrics";

  return { available: true, label, type };
}

/** Triggers a biometric authentication prompt. Returns true on success. */
export async function promptBiometric(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}

export function useBiometricCapability() {
  const [capability, setCapability] = useState<BiometricCapability>({
    available: false,
    label: "Biometrics",
    type: null,
  });

  useEffect(() => {
    getBiometricCapability().then(setCapability).catch(() => undefined);
  }, []);

  return capability;
}
