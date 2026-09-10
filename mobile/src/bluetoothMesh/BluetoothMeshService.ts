import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
// react-native-ble-advertiser gives us a real, symmetric broadcast+scan API on
// both Android and iOS (it's the standard "contact tracing beacon" style
// library). We deliberately avoid GATT connections/peripheral servers — that
// role is unreliable across the RN ecosystem — in favor of pure advertisement
// broadcasts, reassembled client-side. See protocol.ts for why.
// There's no web build of this native module at all (not even a stub), so
// requiring it on web throws instead of returning undefined — skip it there.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BLEAdvertiser =
  Platform.OS === "web" ? null : require("react-native-ble-advertiser").default ?? require("react-native-ble-advertiser");
import {
  BROADCAST_TARGET,
  ChunkAssembler,
  COMPANY_ID,
  DEFAULT_TTL,
  SERVICE_UUID,
  MeshMessage,
  createMessage,
  decodeChunkHeader,
  encodeMessageChunks,
} from "./protocol";
import { getDeviceId, nextSeq } from "./deviceIdentity";
import { messageStore } from "./messageStore";

export type MeshStatus = "idle" | "starting" | "running" | "unsupported" | "permission-denied" | "bluetooth-off";

export interface NearbyPeer {
  deviceId: string;
  name: string;
  lastSeenAt: number;
}

type Listener<T> = (value: T) => void;

const CHUNK_BROADCAST_INTERVAL_MS = 300; // how long each chunk sits in our advertisement slot
const PEER_TIMEOUT_MS = 20000;

/**
 * Runs the offline mesh: continuously advertises small chunks of every
 * message this device still needs to relay, and continuously scans for the
 * same from everyone nearby. No Wi-Fi, no mobile data, no server — every
 * byte here travels as a raw BLE advertisement between phones.
 */
class BluetoothMeshService {
  private deviceId = "";
  private displayName = "Me";
  private status: MeshStatus = "idle";
  private statusListeners = new Set<Listener<MeshStatus>>();
  private peers = new Map<string, NearbyPeer>();
  private peerListeners = new Set<Listener<NearbyPeer[]>>();
  private started = false;

  private relayTtl = new Map<string, number>(); // messageId -> hops remaining to (re)broadcast
  private assembler = new ChunkAssembler();
  private eventEmitter: NativeEventEmitter | null = null;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private outboxCursor = { messageIndex: 0, chunkIndex: 0 };

  async start(displayName: string): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.displayName = displayName;
    this.setStatus("starting");

    this.deviceId = await getDeviceId();
    await messageStore.load();
    this.seedRelayTtlFromHistory();

    if (!BLEAdvertiser) {
      this.setStatus("unsupported");
      return;
    }

    const granted = await requestBlePermissions();
    if (!granted) {
      this.setStatus("permission-denied");
      return;
    }

    try {
      BLEAdvertiser.setCompanyId(COMPANY_ID);
      this.eventEmitter = new NativeEventEmitter(NativeModules.BLEAdvertiser);
      this.eventEmitter.addListener("onDeviceFound", (event) => this.onScanEvent(event));
      this.eventEmitter.addListener("onBTStatusChange", (enabled: boolean) => {
        if (!enabled) this.setStatus("bluetooth-off");
        else if (this.status === "bluetooth-off") this.beginRunning();
      });

      await BLEAdvertiser.scanByService(SERVICE_UUID, { scanMode: 2 /* SCAN_MODE_LOW_LATENCY */ });
      this.beginRunning();
    } catch (err) {
      console.warn("Bluetooth mesh: failed to start", err);
      this.setStatus("unsupported");
    }
  }

  private beginRunning() {
    this.setStatus("running");
    this.broadcastTimer = setInterval(() => this.tickBroadcast(), CHUNK_BROADCAST_INTERVAL_MS);
  }

  stop(): void {
    this.started = false;
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
    this.broadcastTimer = null;
    try {
      BLEAdvertiser?.stopBroadcast?.();
      BLEAdvertiser?.stopScan?.();
    } catch {
      // best-effort teardown
    }
    this.eventEmitter?.removeAllListeners("onDeviceFound");
    this.eventEmitter?.removeAllListeners("onBTStatusChange");
    this.setStatus("idle");
  }

  // --- Outbound: cycle chunks of everything still worth relaying --------------

  private tickBroadcast() {
    const outbox = messageStore.all().filter((m) => (this.relayTtl.get(m.id) ?? 0) > 0);
    if (outbox.length === 0) return;

    if (this.outboxCursor.messageIndex >= outbox.length) this.outboxCursor = { messageIndex: 0, chunkIndex: 0 };
    const message = outbox[this.outboxCursor.messageIndex];
    const chunks = encodeMessageChunks({ ...message, ttl: this.relayTtl.get(message.id) ?? message.ttl });

    const chunk = chunks[this.outboxCursor.chunkIndex];
    BLEAdvertiser.broadcast(SERVICE_UUID, chunk, {
      advertiseMode: 2 /* ADVERTISE_MODE_LOW_LATENCY */,
      connectable: false,
    }).catch(() => {
      // A dropped advertisement just gets retried on the next full cycle.
    });

    this.outboxCursor.chunkIndex += 1;
    if (this.outboxCursor.chunkIndex >= chunks.length) {
      this.outboxCursor.chunkIndex = 0;
      this.outboxCursor.messageIndex += 1;
      if (this.outboxCursor.messageIndex >= outbox.length) {
        // Finished one full rotation of the outbox: every message that's
        // been fully cycled has been given one more chance to reach a
        // device that wasn't listening a moment ago. Age them all down.
        for (const m of outbox) {
          const remaining = (this.relayTtl.get(m.id) ?? 0) - 1;
          if (remaining <= 0) this.relayTtl.delete(m.id);
          else this.relayTtl.set(m.id, remaining);
        }
        this.outboxCursor = { messageIndex: 0, chunkIndex: 0 };
      }
    }
  }

  // --- Inbound: reassemble chunks scanned from nearby devices ------------------

  private onScanEvent(event: any) {
    const manufData: number[] | undefined = event?.manufData;
    if (!manufData || manufData.length === 0) return;
    const unsigned = manufData.map((b: number) => (b < 0 ? b + 256 : b));
    const chunk = decodeChunkHeader(unsigned);
    if (!chunk) return;

    const message = this.assembler.add(chunk);
    if (!message) return; // still waiting on more chunks for this message

    if (message.fromDeviceId === this.deviceId) return; // hearing our own broadcast echoed back
    this.upsertPeer(message.fromDeviceId, message.fromName);

    const isNew = messageStore.add(message);
    if (!isNew) return;

    // Store-and-forward: relay it onward with one fewer hop available, so it
    // keeps propagating toward devices we can't personally reach.
    const hopsRemaining = chunk.ttl - 1;
    if (hopsRemaining > 0) this.relayTtl.set(message.id, hopsRemaining);
  }

  private seedRelayTtlFromHistory() {
    // On a cold start, give every already-known message a fresh (short) round
    // of rebroadcasts so a phone that was off can still help others catch up.
    for (const m of messageStore.all()) {
      if (!this.relayTtl.has(m.id)) this.relayTtl.set(m.id, Math.min(2, m.ttl));
    }
  }

  private upsertPeer(deviceId: string, name: string) {
    this.peers.set(deviceId, { deviceId, name, lastSeenAt: Date.now() });
    this.emitPeers();
  }

  // --- Public API used by the UI ----------------------------------------------

  async sendMessage(toDeviceId: string, text: string): Promise<MeshMessage> {
    const seq = await nextSeq();
    const message = createMessage({
      fromDeviceId: this.deviceId,
      fromName: this.displayName,
      toDeviceId,
      text,
      seq,
    });
    messageStore.add(message);
    this.relayTtl.set(message.id, DEFAULT_TTL);
    return message;
  }

  async broadcast(text: string): Promise<MeshMessage> {
    return this.sendMessage(BROADCAST_TARGET, text);
  }

  getMyDeviceId(): string {
    return this.deviceId;
  }

  onStatusChange(listener: Listener<MeshStatus>): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onPeersChange(listener: Listener<NearbyPeer[]>): () => void {
    this.peerListeners.add(listener);
    listener(this.getPeers());
    return () => this.peerListeners.delete(listener);
  }

  getPeers(): NearbyPeer[] {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    return Array.from(this.peers.values()).filter((p) => p.lastSeenAt >= cutoff);
  }

  private setStatus(status: MeshStatus) {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }

  private emitPeers() {
    const peers = this.getPeers();
    for (const l of this.peerListeners) l(peers);
  }
}

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true; // iOS prompts automatically on first BLE use
  if (typeof Platform.Version === "number" && Platform.Version < 31) {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export const bluetoothMeshService = new BluetoothMeshService();
