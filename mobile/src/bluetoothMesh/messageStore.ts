import AsyncStorage from "@react-native-async-storage/async-storage";
import { BROADCAST_TARGET, MeshMessage } from "./protocol";

const MESSAGES_KEY = "bluetoothMesh:messages";
const MAX_STORED_MESSAGES = 2000;

/**
 * Local append-only log of every mesh message this device has ever seen
 * (sent, received, or relayed). Doubles as the "seen id" set that stops the
 * same message being relayed in circles around the mesh.
 */
export class MessageStore {
  private byId = new Map<string, MeshMessage>();
  private listeners = new Set<() => void>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    const raw = await AsyncStorage.getItem(MESSAGES_KEY);
    if (raw) {
      try {
        const list: MeshMessage[] = JSON.parse(raw);
        for (const m of list) this.byId.set(m.id, m);
      } catch {
        // Corrupt cache — start fresh rather than crash the mesh.
      }
    }
    this.loaded = true;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Returns true if the message was new (and so should be relayed onward). */
  add(message: MeshMessage): boolean {
    if (this.byId.has(message.id)) return false;
    this.byId.set(message.id, message);
    this.prune();
    this.persist();
    this.emit();
    return true;
  }

  addMany(messages: MeshMessage[]): MeshMessage[] {
    const added: MeshMessage[] = [];
    for (const m of messages) {
      if (!this.byId.has(m.id)) {
        this.byId.set(m.id, m);
        added.push(m);
      }
    }
    if (added.length > 0) {
      this.prune();
      this.persist();
      this.emit();
    }
    return added;
  }

  allIds(): string[] {
    return Array.from(this.byId.keys());
  }

  /** Messages relevant to a given conversation: broadcast + direct-to-me + sent-by-me. */
  forThread(myDeviceId: string, peerDeviceId: string): MeshMessage[] {
    return this.all().filter(
      (m) =>
        (m.fromDeviceId === myDeviceId && m.toDeviceId === peerDeviceId) ||
        (m.fromDeviceId === peerDeviceId && (m.toDeviceId === myDeviceId || m.toDeviceId === BROADCAST_TARGET)) ||
        (m.fromDeviceId === myDeviceId && m.toDeviceId === BROADCAST_TARGET && peerDeviceId === BROADCAST_TARGET)
    );
  }

  broadcastThread(): MeshMessage[] {
    return this.all().filter((m) => m.toDeviceId === BROADCAST_TARGET);
  }

  all(): MeshMessage[] {
    return Array.from(this.byId.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private prune() {
    if (this.byId.size <= MAX_STORED_MESSAGES) return;
    const sorted = this.all();
    const toDrop = sorted.slice(0, sorted.length - MAX_STORED_MESSAGES);
    for (const m of toDrop) this.byId.delete(m.id);
  }

  private persist() {
    AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(this.all())).catch(() => {
      // Best-effort — an in-memory copy survives for the rest of this session either way.
    });
  }
}

export const messageStore = new MessageStore();
