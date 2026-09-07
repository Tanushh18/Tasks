// Wire protocol for the offline Bluetooth mesh chat.
//
// There is no server, no Wi-Fi, and no mobile data involved anywhere in this
// file. Messages travel purely as BLE *advertisement* broadcasts — the same
// mechanism contact-tracing / proximity-beacon apps use — rather than GATT
// connections. That trade-off is deliberate: cross-platform GATT "peripheral"
// (accept-incoming-connection) support in the RN ecosystem is unreliable, but
// BLE advertising + scanning is supported symmetrically on Android and iOS.
//
// The cost is that a single BLE advertisement packet only fits ~20-23 bytes
// of manufacturer data, so a message is split into small chunks and each
// device *repeatedly* cycles its outbound chunks through its advertisement
// slot; nearby scanners reassemble a message once they've collected every
// chunk. There's no ack channel — reliability comes from repetition, not
// confirmation. Expect delivery to take seconds, not milliseconds; that's the
// nature of a connectionless offline broadcast mesh.

export const SERVICE_UUID = "0000fef3-0000-1000-8000-00805f9b34fb";
export const COMPANY_ID = 0x02e5; // arbitrary company id, only used to tag our own packets

export const DEFAULT_TTL = 5; // number of devices a message may be re-broadcast through
export const BROADCAST_TARGET = "*";

// Header: [idHash x4][chunkIndex][chunkCount][ttl] = 7 bytes.
// Manufacturer-data payloads this small are reliably accepted on both
// platforms; keep total packet (header + payload) at 20 bytes.
export const HEADER_BYTES = 7;
export const CHUNK_PAYLOAD_BYTES = 13;

export interface MeshMessage {
  /** `${fromDeviceId}:${seq}` — unique per originating device. */
  id: string;
  fromDeviceId: string;
  fromName: string;
  toDeviceId: string; // BROADCAST_TARGET, or in principle a specific short device id
  text: string;
  createdAt: number;
  ttl: number;
}

export function createMessage(params: {
  fromDeviceId: string;
  fromName: string;
  toDeviceId: string;
  text: string;
  seq: number;
}): MeshMessage {
  return {
    id: `${params.fromDeviceId}:${params.seq}`,
    fromDeviceId: params.fromDeviceId,
    fromName: params.fromName,
    toDeviceId: params.toDeviceId,
    text: params.text,
    createdAt: Date.now(),
    ttl: DEFAULT_TTL,
  };
}

// --- Compact wire encoding ---------------------------------------------------
//
// JSON would burn most of a 13-byte chunk budget on punctuation and key
// names, so messages are serialized as a short delimited string instead.
// Field order: version, fromDeviceId, seq, toDeviceId, ttl, createdAt(base36),
// fromName, text. Unit separator (0x1F) can't appear in normal chat text.

const FIELD_SEP = "";
const WIRE_VERSION = "1";

export function encodeMessageForWire(message: MeshMessage): string {
  const [fromDeviceId, seq] = message.id.split(":");
  return [
    WIRE_VERSION,
    fromDeviceId,
    seq,
    message.toDeviceId,
    String(message.ttl),
    message.createdAt.toString(36),
    message.fromName.slice(0, 16),
    message.text,
  ].join(FIELD_SEP);
}

export function decodeMessageFromWire(raw: string): MeshMessage | null {
  const parts = raw.split(FIELD_SEP);
  if (parts.length !== 8 || parts[0] !== WIRE_VERSION) return null;
  const [, fromDeviceId, seq, toDeviceId, ttl, createdAt36, fromName, text] = parts;
  if (!fromDeviceId || !seq) return null;
  return {
    id: `${fromDeviceId}:${seq}`,
    fromDeviceId,
    fromName,
    toDeviceId,
    text,
    createdAt: parseInt(createdAt36, 36),
    ttl: parseInt(ttl, 10) || 0,
  };
}

// --- Byte chunking for BLE advertisement manufacturer data -------------------

/** Simple 32-bit FNV-1a hash — only used to key chunk reassembly, not for security. */
export function hashToId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface ChunkPacket {
  idHash: number;
  chunkIndex: number;
  chunkCount: number;
  ttl: number;
  payload: number[]; // unsigned bytes 0-255
}

export function encodeMessageChunks(message: MeshMessage): number[][] {
  const wire = encodeMessageForWire(message);
  const bytes = utf8Bytes(wire);
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_PAYLOAD_BYTES));
  const idHash = hashToId(message.id);
  const packets: number[][] = [];
  for (let i = 0; i < chunkCount; i++) {
    const payload = bytes.slice(i * CHUNK_PAYLOAD_BYTES, (i + 1) * CHUNK_PAYLOAD_BYTES);
    packets.push(encodeChunkHeader({ idHash, chunkIndex: i, chunkCount, ttl: message.ttl, payload }));
  }
  return packets;
}

function encodeChunkHeader(chunk: ChunkPacket): number[] {
  const { idHash, chunkIndex, chunkCount, ttl, payload } = chunk;
  return [
    (idHash >>> 24) & 0xff,
    (idHash >>> 16) & 0xff,
    (idHash >>> 8) & 0xff,
    idHash & 0xff,
    chunkIndex & 0xff,
    chunkCount & 0xff,
    ttl & 0xff,
    ...payload,
  ];
}

export function decodeChunkHeader(bytes: number[]): ChunkPacket | null {
  if (bytes.length < HEADER_BYTES) return null;
  const idHash = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return {
    idHash,
    chunkIndex: bytes[4],
    chunkCount: bytes[5],
    ttl: bytes[6],
    payload: bytes.slice(HEADER_BYTES),
  };
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  const encoded = unescape(encodeURIComponent(value));
  for (let i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
  return bytes;
}

function bytesToUtf8(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return decodeURIComponent(escape(binary));
}

/** Reassembles chunks (in any order, possibly with duplicates) for one message id. */
export class ChunkAssembler {
  private chunks = new Map<number, Map<number, number[]>>(); // idHash -> chunkIndex -> payload
  private expectedCount = new Map<number, number>();

  add(chunk: ChunkPacket): MeshMessage | null {
    if (!this.chunks.has(chunk.idHash)) this.chunks.set(chunk.idHash, new Map());
    const forId = this.chunks.get(chunk.idHash)!;
    forId.set(chunk.chunkIndex, chunk.payload);
    this.expectedCount.set(chunk.idHash, chunk.chunkCount);

    if (forId.size < chunk.chunkCount) return null;

    const bytes: number[] = [];
    for (let i = 0; i < chunk.chunkCount; i++) {
      const part = forId.get(i);
      if (!part) return null; // still missing a chunk
      bytes.push(...part);
    }
    this.chunks.delete(chunk.idHash);
    this.expectedCount.delete(chunk.idHash);

    try {
      return decodeMessageFromWire(bytesToUtf8(bytes));
    } catch {
      return null;
    }
  }
}
