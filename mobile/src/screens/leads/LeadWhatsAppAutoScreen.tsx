import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, Switch, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { autoSendSupported, findImage, listImages, isServiceEnabled, openAccessibilitySettings, saveImageToFolder, whatsappPackage } from "../../leads/whatsappAuto";
import { dailyTarget, dayKey } from "../../leads/whatsappAutoPlan";
import * as api from "../../api/leads";
import { ALL_SHEETS, addCustomMessage, loadCustomMessages, loadSheetChoice, removeCustomMessage, saveSheetChoice } from "../../leads/whatsappAutoMessages";
import { FilterChip, FilterChipGroup } from "../../components/FilterChip";
import { backgroundStatus, backgroundSupported, openBatterySettings, startBackgroundSender, stopBackgroundSender, type BackgroundState } from "../../leads/whatsappAutoBackground";
import { loadState, resetAutoCounts, runFullFlowOnce, sendTest, sendTestNumber, startRunner, type AutoState, type RunStatus, type RunnerHandle } from "../../leads/whatsappAutoRunner";
import { AUTO_TEMPLATES, type AutoTemplate } from "../../leads/whatsappAutoTemplates";
import { useTheme } from "../../theme/useTheme";

/** Test chats. Test runs only ever message these; they never touch a lead. */
const TEST_CHATS = ["tanushh18", "We Three"];

/**
 * WhatsApp auto send for the tablet. The toggle runs the sender: to saved leads (12-13 a day, 10 AM to 7 PM) with a
 * built-in or own message and the picture from the folder. Test buttons send to the test chats instead.
 */
export function LeadWhatsAppAutoScreen() {
  const { colors, spacing, typography } = useTheme();
  const [enabled, setEnabled] = useState(isServiceEnabled());
  const [image, setImage] = useState<{ uri: string } | null>(null);
  const [images, setImages] = useState<{ uri: string; name: string }[]>([]);
  const [state, setState] = useState<AutoState | null>(null);
  const [custom, setCustom] = useState<AutoTemplate[]>([]);
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState(ALL_SHEETS);
  const [origins, setOrigins] = useState<api.OriginCount[]>([]);
  const [status, setStatus] = useState<RunStatus>({ phase: "idle", text: "Off." });
  const [busy, setBusy] = useState<string | null>(null);
  const [testRun, setTestRun] = useState(false);
  const [bg, setBg] = useState<BackgroundState | null>(null);
  const [testNumber, setTestNumber] = useState("9899334123");
  const runner = useRef<RunnerHandle | null>(null);

  useEffect(() => {
    const id = setInterval(() => setBg(backgroundStatus()), 5000);
    setBg(backgroundStatus());
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setEnabled(isServiceEnabled());
    setImage(await findImage());
    setImages(await listImages());
    setState(await loadState());
    setCustom(await loadCustomMessages());
    setSheet(await loadSheetChoice());
    try {
      setOrigins(await api.listOrigins());
    } catch {
      // Offline: keep the last list.
    }
  }, []);

  const chooseSheet = async (name: string) => {
    setSheet(name);
    await saveSheetChoice(name);
  };

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh());
    return () => { sub.remove(); runner.current?.stop(); };
  }, [refresh]);

  const running = status.phase === "sending" || status.phase === "waiting";
  const runningTest = running && testRun;
  const stopAll = () => { runner.current?.stop(); runner.current = null; };

  /** The switch: on starts the background sender (works with other apps open); off stops it. */
  /** Test only: background sender with 15-second gaps, ignoring the window. Use it with another app open. */
  const backgroundTest = async () => {
    if (!image) return Alert.alert("Choose an image first.");
    try {
      await startBackgroundSender(true);
      setBg(backgroundStatus());
      setStatus({ phase: "waiting", text: "Background test is on: a send every 15 seconds." });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Couldn't start the background test.");
    }
  };

  const toggleBackground = async (on: boolean) => {
    if (!on) {
      stopBackgroundSender();
      setBg(backgroundStatus());
      setStatus({ phase: "idle", text: "Auto send stopped." });
      return;
    }
    if (!image) return Alert.alert("Choose an image first.");
    try {
      await startBackgroundSender();
      setBg(backgroundStatus());
      setStatus({ phase: "waiting", text: "Auto send is on in the background." });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Couldn't start auto send.");
    }
  };

  const setOn = (on: boolean, testChats?: string[]) => {
    if (!on) return stopAll();
    setTestRun(!!testChats?.length);
    if (!image) return Alert.alert("Choose an image first.");
    runner.current = startRunner({ testChats, origin: sheet === ALL_SHEETS ? undefined : sheet, onStatus: setStatus, onState: setState });
    setStatus({ phase: "waiting", text: "Starting..." });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Allow photo access to choose the image.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await saveImageToFolder(a.uri, a.mimeType ?? "image/jpeg");
    await refresh();
  };

  const oneTest = async (chat: string) => {
    setTestRun(false);
    setBusy(chat);
    setStatus({ phase: "sending", text: `Test: sending to ${chat}...` });
    const r = await sendTest(chat);
    setBusy(null);
    setStatus({ phase: "idle", text: r.ok ? `Test sent to ${chat} (${r.template}).` : `Test failed: ${r.error}` });
    await refresh();
  };

  const oneNumberTest = async () => {
    setTestRun(false);
    setBusy("number");
    setStatus({ phase: "sending", text: `Test: sending to ${testNumber}...` });
    const r = await sendTestNumber(testNumber);
    setBusy(null);
    setStatus({ phase: "idle", text: r.ok ? `Test sent to ${testNumber} (${r.template}).` : `Test failed: ${r.error}` });
    await refresh();
  };

  const fullTest = async () => {
    setTestRun(false);
    setBusy("full");
    setStatus({ phase: "sending", text: "Full flow test: one lead from the chosen list..." });
    const r = await runFullFlowOnce(sheet === ALL_SHEETS ? undefined : sheet);
    setBusy(null);
    setStatus({ phase: "idle", text: r.ok ? `Full flow test sent to ${r.lead}.` : `Full flow test failed${r.lead ? ` (${r.lead})` : ""}: ${r.error}` });
    await refresh();
  };

  const resetCounts = async () => {
    await resetAutoCounts();
    await refresh();
    setStatus({ phase: "idle", text: "Counts reset to 0." });
  };

  const addMessage = async () => {
    try {
      setCustom(await addCustomMessage(draft));
      setDraft("");
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Couldn't save the message.");
    }
  };

  const pkg = whatsappPackage();
  const target = dailyTarget(dayKey());
  const muted = { color: colors.textMuted } as const;

  if (!autoSendSupported) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, muted]}>This build can't do auto send. Install the newest APK.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={typography.h3}>Auto send to leads</Text>
          <Switch
            value={!!bg?.enabled}
            onValueChange={(v) => toggleBackground(v)}
            disabled={!enabled || !image}
            accessibilityLabel="Auto send to leads"
            accessibilityRole="switch"
          />
        </View>
        <Text style={[typography.body, muted]}>
          Today: {bg?.enabled ? bg.sentToday : state?.sentToday ?? 0} / {target} · Total by auto send: {bg?.enabled ? bg.sentTotal : state?.sentTotal ?? 0}
        </Text>
        <Text style={typography.body}>{bg?.enabled ? bg.status || "Running in the background." : status.text}</Text>
        <Button label="Reset counts" variant="ghost" disabled={running || !!busy} onPress={() => Alert.alert("Reset counts?", "Sets today and total back to 0 and clears the recent log on this tablet. Lead data on the server is not changed.", [{ text: "Cancel", style: "cancel" }, { text: "Reset", onPress: resetCounts }])} />
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Test first</Text>
        <Text style={[typography.caption, muted]}>Only WhatsApp Business is used. The chat tests below send to test chats only.</Text>
        <Text style={[typography.body, muted]}>WhatsApp: {pkg === "com.whatsapp.w4b" ? "Business" : pkg === "com.whatsapp" ? "normal (Business not installed)" : "not installed"} · Accessibility service: {enabled ? "on" : "off"}</Text>
        {!enabled ? <Button label="Turn on accessibility service" onPress={openAccessibilitySettings} /> : null}
        {backgroundSupported ? <Button label="Let auto send run in the background" variant="secondary" onPress={openBatterySettings} /> : null}
        {TEST_CHATS.map((chat) => (
          <Button key={chat} label={`Send one test to ${chat}`} variant="secondary" loading={busy === chat} disabled={!enabled || !image || running || !!busy} onPress={() => oneTest(chat)} />
        ))}
        <TextField label="Test number (opened by number, like a lead)" value={testNumber} onChangeText={setTestNumber} keyboardType="phone-pad" maxLength={14} />
        <Button label={`Send one test to ${testNumber || "number"}`} variant="secondary" loading={busy === "number"} disabled={!enabled || !image || running || !!busy || !testNumber.trim()} onPress={oneNumberTest} />
        <Button
          label="Background test: 15-second gaps, ignores the window"
          variant="secondary"
          disabled={!enabled || !image || !!bg?.enabled}
          onPress={backgroundTest}
        />
        <Button
          label="Full flow test (one lead from the chosen list)"
          variant="secondary"
          loading={busy === "full"}
          disabled={!enabled || !image || running || !!busy}
          onPress={() => Alert.alert("Send one real message?", "This sends one WhatsApp message to the first unsent lead in the chosen list, now. It ignores the 10 AM–7 PM window.", [{ text: "Cancel", style: "cancel" }, { text: "Send", onPress: fullTest }])}
        />
        <Button
          label={runningTest ? "Stop test run" : "Start test run (both chats)"}
          variant={runningTest ? "danger" : "primary"}
          disabled={!enabled || !image || (running && !runningTest)}
          onPress={() => (runningTest ? stopAll() : setOn(true, TEST_CHATS))}
        />
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Send to which list</Text>
        <Text style={[typography.caption, muted]}>Leads that haven't had WhatsApp yet, from the chosen list only. Change it while auto send is off.</Text>
        <FilterChipGroup>
          <FilterChip label="All lists" selected={sheet === ALL_SHEETS} onPress={() => !running && chooseSheet(ALL_SHEETS)} />
          {origins.map((o) => (
            <FilterChip key={o.name} label={`${o.name} (${o.count})`} selected={sheet === o.name} onPress={() => !running && chooseSheet(o.name)} />
          ))}
        </FilterChipGroup>
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Image</Text>
        {images.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {images.map((im) => (
              <Image key={im.uri} source={{ uri: im.uri }} style={{ width: 160, height: 160, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={im.name} />
            ))}
          </View>
        ) : (
          <Text style={[typography.body, muted]}>No image chosen yet.</Text>
        )}
        <Text style={[typography.caption, muted]}>{images.length} image(s) in the folder. Each send picks one at random.</Text>
        <Button label={image ? "Change image" : "Choose image"} variant="secondary" onPress={pickImage} />
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <Text style={typography.h3}>Messages</Text>
        <Text style={[typography.caption, muted]}>{AUTO_TEMPLATES.length} built-in, plus your own. Each send picks one at random, not the same one twice in a row.</Text>
        <TextField label="New message" value={draft} onChangeText={setDraft} multiline placeholder="Type the message to add" maxLength={1000} />
        <Button label="Save message" variant="secondary" disabled={!draft.trim()} onPress={addMessage} />
        {custom.map((m) => (
          <View key={m.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, gap: spacing.xs }}>
            <Text style={typography.body}>{m.text}</Text>
            <Button label="Remove" variant="ghost" onPress={async () => setCustom(await removeCustomMessage(m.id))} />
          </View>
        ))}
      </Card>

      <Card style={{ marginBottom: spacing.md, gap: spacing.xs }}>
        <Text style={typography.h3}>Recent</Text>
        {(state?.log ?? []).slice(0, 15).map((l) => (
          <Text key={l.at} style={[typography.caption, muted]}>
            {new Date(l.at).toLocaleTimeString()} · {l.name || l.phone} · {l.template} · {l.ok ? "sent" : `failed: ${l.error}`}
          </Text>
        ))}
        {!state?.log.length ? <Text style={[typography.caption, muted]}>Nothing yet.</Text> : null}
      </Card>
    </ScreenContainer>
  );
}
