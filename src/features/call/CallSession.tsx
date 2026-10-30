import { useRouter, usePathname } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallAudioSink } from "@/features/call/CallAudioSink";
import { CallLobby, type CallEntry } from "@/features/call/CallLobby";
import { IncomingCallNotice } from "@/features/call/IncomingCallNotice";
import { MiniCall } from "@/features/call/MiniCall";
import type { RoomCallControls } from "@/features/call/roomCallTypes";
import { primeRingtone } from "@/features/call/ringtone";
import { announceRoomCall } from "@/features/call/startCall";
import { useRoomCall } from "@/features/call/useRoomCall";
import { displayNameFor } from "@/session/displayName";
import { useSession } from "@/session/Session";
import { getTransport } from "@/transport";
import type { TransportEnvelope } from "@/transport/types";

export interface IncomingCall {
  roomId: string;
  roomName: string;
  startedBy?: string;
  startedName: string;
}

interface RawCall {
  roomId: string;
  startedBy?: string;
  startedName?: string;
  participantIds: string[];
}

interface CallApi {
  roomId: string | null;
  holdRoomId: string | null;
  startCall: (roomId: string) => void;
  openLobby: (entry: CallEntry) => void;
  requestJoin: (call: IncomingCall) => void;
  minimize: () => void;
  restore: () => void;
}

const CallApiContext = createContext<CallApi | null>(null);
const LiveCallContext = createContext<RoomCallControls | null>(null);

export function useCallSession() {
  const value = useContext(CallApiContext);
  if (!value) {
    throw new Error("Call session is unavailable");
  }
  return value;
}

export function useCallControls() {
  return useContext(LiveCallContext);
}

function onCallPath(pathname: string) {
  return pathname === "/call" || pathname.startsWith("/call/");
}

function readCalls(envelope: TransportEnvelope): RawCall[] | null {
  if (envelope.type === "roster") {
    const calls = (envelope.payload as { calls?: RawCall[] }).calls ?? [];
    return calls.filter((call) => typeof call.roomId === "string" && call.roomId.length > 0);
  }
  if (envelope.type !== "status") {
    return null;
  }
  const payload = envelope.payload as RawCall & { active?: boolean; roomId?: string };
  if (!payload.roomId) {
    return null;
  }
  if (!payload.active) {
    return [];
  }
  return [
    {
      roomId: payload.roomId,
      startedBy: payload.startedBy,
      startedName: payload.startedName,
      participantIds: payload.participantIds ?? [],
    },
  ];
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { name, clientId } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [holdRoomId, setHoldRoomId] = useState<string | null>(null);
  const [notice, setNotice] = useState<IncomingCall | null>(null);
  const [ringing, setRinging] = useState(false);
  const [confirm, setConfirm] = useState<IncomingCall | null>(null);
  const [lobby, setLobby] = useState<CallEntry | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const nameRef = useRef(name);
  const clientIdRef = useRef(clientId);
  const pathnameRef = useRef(pathname);
  const noticeRef = useRef(notice);
  const confirmRef = useRef(confirm);
  const knownRef = useRef(new Set<string>());
  const dismissedRef = useRef(new Set<string>());

  roomIdRef.current = roomId;
  nameRef.current = name;
  clientIdRef.current = clientId;
  pathnameRef.current = pathname;
  noticeRef.current = notice;
  confirmRef.current = confirm;

  const endCall = useCallback(() => {
    const ended = roomIdRef.current;
    const path = pathnameRef.current;
    const onCall = path === "/call" || path.startsWith("/call/");
    roomIdRef.current = null;
    if (ended && onCall) {
      setHoldRoomId(ended);
    }
    setRoomId(null);
    if (onCall) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/rooms");
      }
    }
  }, [router]);

  const controls = useRoomCall(roomId, endCall);

  const forgetCall = useCallback((target: string) => {
    knownRef.current.delete(target);
    dismissedRef.current.delete(target);
    if (noticeRef.current?.roomId === target) {
      setNotice(null);
      setRinging(false);
    }
    if (confirmRef.current?.roomId === target) {
      setConfirm(null);
    }
    setLobby((current) => (current?.roomId === target ? null : current));
  }, []);

  const describe = useCallback((call: RawCall): IncomingCall => {
    const peers = getTransport().snapshot("presence").peers;
    const room = getTransport().snapshot("rooms").rooms.find((item) => item.id === call.roomId);
    return {
      roomId: call.roomId,
      roomName: room?.name ?? "this room",
      startedBy: call.startedBy,
      startedName: displayNameFor(peers, call.startedBy, call.startedName?.trim() || "Someone", {
        clientId: clientIdRef.current,
        name: nameRef.current,
      }),
    };
  }, []);

  const consider = useCallback(
    (call: RawCall, isNew: boolean) => {
      const mine = call.participantIds.includes(clientIdRef.current) || call.roomId === roomIdRef.current;
      if (mine) {
        if (noticeRef.current?.roomId === call.roomId) {
          setNotice(null);
          setRinging(false);
        }
        if (confirmRef.current?.roomId === call.roomId && call.participantIds.includes(clientIdRef.current)) {
          setConfirm(null);
        }
        return;
      }
      if (!isNew || dismissedRef.current.has(call.roomId)) {
        return;
      }
      setNotice(describe(call));
      setRinging(true);
    },
    [describe],
  );

  useEffect(() => {
    if (!onCallPath(pathname)) {
      setHoldRoomId(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }
    const prime = () => primeRingtone();
    window.addEventListener("pointerdown", prime);
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

  useEffect(() => {
    return getTransport().subscribe("call", (envelope) => {
      if (envelope.type === "roster") {
        const calls = readCalls(envelope) ?? [];
        const seen = new Set(calls.map((call) => call.roomId));
        for (const id of [...knownRef.current]) {
          if (!seen.has(id)) {
            forgetCall(id);
          }
        }
        for (const call of calls) {
          const isNew = !knownRef.current.has(call.roomId);
          knownRef.current.add(call.roomId);
          consider(call, isNew);
        }
        return;
      }
      if (envelope.type !== "status") {
        return;
      }
      const payload = envelope.payload as { roomId?: string; active?: boolean };
      if (!payload.roomId) {
        return;
      }
      if (!payload.active) {
        forgetCall(payload.roomId);
        return;
      }
      const [call] = readCalls(envelope) ?? [];
      if (!call) {
        return;
      }
      const isNew = !knownRef.current.has(call.roomId);
      knownRef.current.add(call.roomId);
      consider(call, isNew);
    });
  }, [consider, forgetCall]);

  const startCall = useCallback(
    (nextRoomId: string) => {
      const id = nextRoomId.trim();
      if (!id) {
        return;
      }
      roomIdRef.current = id;
      setHoldRoomId(null);
      announceRoomCall(id, nameRef.current, clientIdRef.current);
      dismissedRef.current.add(id);
      setNotice((current) => (current?.roomId === id ? null : current));
      setConfirm((current) => (current?.roomId === id ? null : current));
      setRinging(false);
      setRoomId(id);
      router.push({ pathname: "/call", params: { room: id } });
    },
    [router],
  );

  const openLobby = useCallback((entry: CallEntry) => {
    const id = entry.roomId.trim();
    if (!id || roomIdRef.current === id) {
      return;
    }
    setLobby({ ...entry, roomId: id });
    setRinging(false);
  }, []);

  const requestJoin = useCallback(
    (call: IncomingCall) => {
      openLobby({
        roomId: call.roomId,
        roomName: call.roomName,
        mode: "join",
        startedBy: call.startedBy,
        startedName: call.startedName,
      });
    },
    [openLobby],
  );

  const cancelLobby = useCallback(() => {
    setLobby(null);
    if (!roomIdRef.current && onCallPath(pathnameRef.current)) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/rooms");
      }
    }
  }, [router]);

  const dismissIncoming = useCallback(() => {
    if (noticeRef.current) {
      dismissedRef.current.add(noticeRef.current.roomId);
    }
    setNotice(null);
    setRinging(false);
  }, []);

  const cancelConfirm = useCallback(() => {
    setConfirm(null);
    setRinging(false);
  }, []);

  const acceptJoin = useCallback(
    (call: IncomingCall) => {
      dismissedRef.current.add(call.roomId);
      roomIdRef.current = call.roomId;
      setHoldRoomId(null);
      setNotice((current) => (current?.roomId === call.roomId ? null : current));
      setConfirm(null);
      setRinging(false);
      setRoomId(call.roomId);
      router.push({ pathname: "/call", params: { room: call.roomId } });
    },
    [router],
  );

  const confirmLobby = useCallback(() => {
    const entry = lobby;
    if (!entry) {
      return;
    }
    setLobby(null);
    if (entry.mode === "join") {
      acceptJoin({
        roomId: entry.roomId,
        roomName: entry.roomName,
        startedBy: entry.startedBy,
        startedName: entry.startedName ?? "Someone",
      });
      return;
    }
    startCall(entry.roomId);
  }, [acceptJoin, lobby, startCall]);

  const minimize = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/rooms");
    }
  }, [router]);

  const restore = useCallback(() => {
    const id = roomIdRef.current;
    if (!id) {
      return;
    }
    router.push({ pathname: "/call", params: { room: id } });
  }, [router]);

  const api = useMemo<CallApi>(
    () => ({ roomId, holdRoomId, startCall, openLobby, requestJoin, minimize, restore }),
    [roomId, holdRoomId, startCall, openLobby, requestJoin, minimize, restore],
  );

  return (
    <CallApiContext.Provider value={api}>
      <LiveCallContext.Provider value={controls}>
        <View style={styles.root}>
          {children}
          {controls ? <CallAudioSink participants={controls.participants} /> : null}
          <View pointerEvents="box-none" style={styles.overlay}>
            <IncomingCallNotice
              notice={notice}
              confirm={confirm}
              ringing={ringing}
              topInset={insets.top}
              onJoin={() => {
                if (notice) {
                  requestJoin(notice);
                }
              }}
              onDismiss={dismissIncoming}
              onAccept={() => {
                if (confirm) {
                  acceptJoin(confirm);
                }
              }}
              onDecline={cancelConfirm}
            />
            {roomId && controls && !onCallPath(pathname) ? (
              <MiniCall call={controls} bottomInset={insets.bottom} onRestore={restore} />
            ) : null}
            {lobby ? <CallLobby entry={lobby} onCancel={cancelLobby} onConfirm={confirmLobby} /> : null}
          </View>
        </View>
      </LiveCallContext.Provider>
    </CallApiContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
  },
});
