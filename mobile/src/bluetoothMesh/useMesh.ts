import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { bluetoothMeshService, MeshStatus, NearbyPeer } from "./BluetoothMeshService";
import { messageStore } from "./messageStore";
import { MeshMessage } from "./protocol";

/** Starts the mesh (once) and keeps status/peers/messages in sync with React state. */
export function useMesh() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MeshStatus>("idle");
  const [peers, setPeers] = useState<NearbyPeer[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    bluetoothMeshService.start(user?.name ?? "Someone");
    const unsubStatus = bluetoothMeshService.onStatusChange(setStatus);
    const unsubPeers = bluetoothMeshService.onPeersChange(setPeers);
    const unsubMessages = messageStore.subscribe(() => setVersion((v) => v + 1));
    return () => {
      unsubStatus();
      unsubPeers();
      unsubMessages();
      // Deliberately not calling bluetoothMeshService.stop() here: the mesh
      // should keep relaying other people's messages for as long as the app
      // is open, not just while this screen is focused.
    };
  }, [user?.name]);

  return {
    status,
    peers,
    myDeviceId: bluetoothMeshService.getMyDeviceId(),
    messagesVersion: version,
  };
}

export function getAllMessages(): MeshMessage[] {
  return messageStore.all();
}

export function getBroadcastMessages(): MeshMessage[] {
  return messageStore.broadcastThread();
}

export function getThreadMessages(myDeviceId: string, peerDeviceId: string): MeshMessage[] {
  return messageStore.forThread(myDeviceId, peerDeviceId);
}
