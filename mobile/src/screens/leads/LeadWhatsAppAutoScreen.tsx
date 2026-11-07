import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { autoSendSupported, findImage, isServiceEnabled, openAccessibilitySettings, saveImageToFolder, whatsappPackage } from "../../leads/whatsappAuto";
import { dailyTarget, dayKey } from "../../leads/whatsappAutoPlan";
import { loadState, sendTest, startRunner, type AutoState, type RunStatus, type RunnerHandle } from "../../leads/whatsappAutoRunner";
import { AUTO_TEMPLATES } from "../../leads/whatsappAutoTemplates";
import { useTheme } from "../../theme/useTheme";

/** The chat used while testing. The real run only ever messages leads from the Leads screen. */
const TEST_CHAT = "tanushh18";

/**
 * WhatsApp auto send for the tablet: presses Send in WhatsApp through an accessibility service, 12-13 leads a day between
 * 10 AM and 7 PM, with one of 12 built-in messages and the picture from the folder.
 */
export function LeadWhatsAppAutoScreen() {
  const { colors, spacing, typography } = useTheme();
  const [enabled, setEnabled] = useState(isServiceEnabled());
  const [image, setImage] = useState<{ uri: string } | null>(null);
  const [state, setState] = useState<AutoState | null>(null);
  const [status, setStatus] = useState<RunStatus>({ phase: "idle", text: "Not running." });
  const [busy, setBusy] = useState(false);
  const runner = useRef<RunnerHandle | null>(null);

  const refresh = useCallback(async () => {
    setEnabled(isServiceEnabled());
    setImage(await findImage());
    setState(await loadState());
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh());
    return () => { sub.remove(); runner.current?.stop(); };
  }, [refresh]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Allow photo access to choose the image.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await saveImageToFolder(a.uri, a.mimeType ?? "image/jpeg");
    await refresh();
  };

  const test = async () => {
    setBusy(true);
    setStatus({ phase: "sending", text: `Test: sending to the ${TEST_CHAT} chat...` });
    const r = await sendTest(TEST_CHAT);
    setBusy(false);
    setStatus({ phase: "idle", text: r.ok ? `Test sent to ${TEST_CHAT} (${r.template}).` : `Test failed: ${r.error}` });
    await refresh();
  };

  const running = status.phase === "sending" || status.phase === "waiting";
  const start = () => {
    runner.current = startRunner({ onStatus: setStatus, onState: setState });
    setStatus({ phase: "waiting", text: "Starting..." });
  };
  const stop = () => { runner.current?.stop(); runner.current = null; };

  const pkg = whatsappPackage();
  const target = dailyTarget(dayKey());
  const line = { color: colors.textMuted } as const;

  if (!autoSendSupported) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, line]}>This build can't do auto send. Install the newest APK.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={typography.h3}>Today: {state?.sentToday ?? 0} / {target}</Text>
        <Text style={[typography.body, line]}>Total sent by auto send: {state?.sentTotal ?? 0}</Text>
        <Text style={[typography.body, line, { marginTop: spacing.sm }]}>{status.text}</Text>
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Setup</Text>
        <Text style={[typography.body, line]}>WhatsApp: {pkg === "com.whatsapp.w4b" ? "WhatsApp Business" : pkg === "com.whatsapp" ? "WhatsApp (Business not installed)" : "not installed"}</Text>
        <Text style={[typography.body, line]}>Accessibility service: {enabled ? "on" : "off"}</Text>
        {!enabled ? <Button label="Turn on in Settings" onPress={openAccessibilitySettings} /> : null}
        {image ? <Image source={{ uri: image.uri }} style={{ width: 120, height: 120, borderRadius: 8 }} resizeMode="cover" /> : <Text style={[typography.body, line]}>No image chosen yet.</Text>}
        <Button label={image ? "Change image" : "Choose image"} variant="secondary" onPress={pickImage} />
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Run</Text>
        <Button label={`Send a test to ${TEST_CHAT}`} variant="secondary" loading={busy} disabled={!enabled || !image || running} onPress={test} />
        {running ? <Button label="Stop" variant="danger" onPress={stop} /> : <Button label="Start sending to leads" disabled={!enabled || !image} onPress={start} />}
        <Text style={[typography.caption, line]}>Sends 12-13 messages a day to leads that haven't had WhatsApp yet, 10 AM to 7 PM, 6-14 minutes apart. Keep the tablet awake and on charge.</Text>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={typography.h3}>Recent</Text>
        {(state?.log ?? []).slice(0, 15).map((l) => (
          <Text key={l.at} style={[typography.caption, line]}>
            {new Date(l.at).toLocaleTimeString()} · {l.name || l.phone} · {l.template} · {l.ok ? "sent" : `failed: ${l.error}`}
          </Text>
        ))}
        {!state?.log.length ? <Text style={[typography.caption, line]}>Nothing yet.</Text> : null}
      </Card>

      <Text style={[typography.caption, line]}>{AUTO_TEMPLATES.length} built-in messages are rotated; none repeats back to back.</Text>
    </ScreenContainer>
  );
}
