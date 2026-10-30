import { useEffect, useRef, useState } from "react";

import type { CallParticipant, RoomCallControls } from "@/features/call/roomCallTypes";
import { takeStagedCamera } from "@/features/call/cameraStage";
import { useSession } from "@/session/Session";
import { subscribeConnection } from "@/transport/connectionPhase";
import { getTransport } from "@/transport";
import type { TransportEnvelope } from "@/transport/types";

interface Signal {
  roomId?: string;
  clientId?: string;
  name?: string;
  from?: string;
  to?: string;
  muted?: boolean;
  cameraOff?: boolean;
  sharing?: boolean;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface RemoteLink {
  id: string;
  name: string;
  muted: boolean;
  cameraOff: boolean;
  pc: RTCPeerConnection | null;
  stream: MediaStream;
  screen: MediaStream | null;
  screenTrack: MediaStreamTrack | null;
  sharing: boolean;
  pendingIce: RTCIceCandidateInit[];
  offered: boolean;
  answered: boolean;
  needsRenegotiation: boolean;
}

function liveParticipantName(id: string | undefined, fallback?: string) {
  const peer = id
    ? getTransport()
        .snapshot("presence")
        .peers.find((item) => item.clientId === id)
    : undefined;
  return peer?.displayName?.trim() || fallback?.trim() || "Guest";
}

const relayHosts = (process.env.EXPO_PUBLIC_TURN_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const turnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() ?? "";
const turnCredential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL?.trim() ?? "";
const relayServers = relayHosts.flatMap((host) => [`stun:${host}:3478`, `turn:${host}:3478`]);

const iceServers: RTCIceServer[] =
  relayServers.length > 0 && turnUsername && turnCredential
    ? [{ urls: relayServers, username: turnUsername, credential: turnCredential }]
    : [];

function logPeer(pc: RTCPeerConnection, label: string) {
  console.log(label, {
    signalingState: pc.signalingState,
    iceGatheringState: pc.iceGatheringState,
    iceConnectionState: pc.iceConnectionState,
    connectionState: pc.connectionState,
  });
}

export function useRoomCall(roomId: string | null, onEnded?: () => void): RoomCallControls | null {
  const { name, clientId } = useSession();
  const clientIdRef = useRef(clientId);
  const roomRef = useRef(roomId ?? "");
  const nameRef = useRef(name);
  const onEndedRef = useRef(onEnded);
  const linksRef = useRef(new Map<string, RemoteLink>());
  const announcedRef = useRef(new Set<string>());
  const localRef = useRef<MediaStream | null>(null);
  const localPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const leftRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const mutedRef = useRef(false);
  const cameraRef = useRef(false);

  if (roomId) {
    roomRef.current = roomId;
  }
  nameRef.current = name;
  clientIdRef.current = clientId;
  onEndedRef.current = onEnded;

  function publishRoster() {
    setParticipants(
      [...linksRef.current.values()].map((link) => ({
        id: link.id,
        name: link.name,
        muted: link.muted,
        cameraOff: link.cameraOff,
        stream: link.stream.getTracks().length > 0 ? new MediaStream(link.stream.getTracks()) : null,
        screenStream: link.screen,
      })),
    );
  }

  useEffect(() => {
    return getTransport().subscribe("presence", () => {
      let changed = false;
      for (const link of linksRef.current.values()) {
        const next = liveParticipantName(link.id, link.name);
        if (next && next !== link.name) {
          link.name = next;
          changed = true;
        }
      }
      if (changed) {
        publishRoster();
      }
    });
  }, []);

  function publish(type: string, payload: Signal) {
    getTransport().publish({
      id: `call-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic: "call",
      type,
      sentAt: new Date().toISOString(),
      clientId: clientIdRef.current,
      payload,
    });
  }

  function isOfferer(remoteId: string) {
    return clientIdRef.current < remoteId;
  }

  function linkFor(remoteId: string) {
    const existing = linksRef.current.get(remoteId);
    if (existing) {
      return existing;
    }
    const link: RemoteLink = {
      id: remoteId,
      name: liveParticipantName(remoteId),
      muted: false,
      cameraOff: false,
      pc: null,
      stream: new MediaStream(),
      screen: null,
      screenTrack: null,
      sharing: false,
      pendingIce: [],
      offered: false,
      answered: false,
      needsRenegotiation: false,
    };
    linksRef.current.set(remoteId, link);
    return link;
  }

  function dropLink(remoteId: string) {
    const link = linksRef.current.get(remoteId);
    if (!link) {
      return;
    }
    link.pc?.close();
    linksRef.current.delete(remoteId);
    announcedRef.current.delete(remoteId);
    publishRoster();
  }

  function closeAll() {
    for (const link of linksRef.current.values()) {
      link.pc?.close();
    }
    linksRef.current.clear();
    announcedRef.current.clear();
    publishRoster();
  }

  function createPeer(remoteId: string) {
    const link = linkFor(remoteId);
    if (link.pc) {
      return link.pc;
    }
    const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: "all" });
    link.pc = pc;
    pc.ontrack = (event) => {
      console.log("ontrack", {
        from: remoteId,
        kind: event.track.kind,
        readyState: event.track.readyState,
        streams: event.streams.length,
      });
      const known = link.stream.getTracks().some((item) => item.id === event.track.id) || link.screenTrack?.id === event.track.id;
      if (known) {
        return;
      }
      if (event.track.kind === "video" && link.sharing && link.stream.getVideoTracks().length > 0 && !link.screenTrack) {
        link.screenTrack = event.track;
        link.screen = new MediaStream([event.track]);
        event.track.onended = () => {
          if (link.screenTrack?.id === event.track.id) {
            link.screenTrack = null;
            link.screen = null;
            link.sharing = false;
            publishRoster();
          }
        };
        publishRoster();
        return;
      }
      if (!link.stream.getTracks().some((item) => item.id === event.track.id)) {
        link.stream.addTrack(event.track);
      }
      publishRoster();
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      publish("ice", {
        roomId: roomRef.current,
        from: clientIdRef.current,
        to: remoteId,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.onsignalingstatechange = () => {
      logPeer(pc, `signalingState ${remoteId.slice(0, 8)}`);
      if (pc.signalingState === "stable" && link.needsRenegotiation) {
        link.needsRenegotiation = false;
        void renegotiate(remoteId);
      }
    };
    pc.oniceconnectionstatechange = () => logPeer(pc, `iceConnectionState ${remoteId.slice(0, 8)}`);
    pc.onconnectionstatechange = () => logPeer(pc, `connectionState ${remoteId.slice(0, 8)}`);
    return pc;
  }

  function outgoingVideoTrack() {
    return localRef.current?.getVideoTracks()[0] ?? null;
  }

  function addLocalTracks(pc: RTCPeerConnection) {
    const local = localRef.current;
    if (!local) {
      return;
    }
    for (const track of local.getAudioTracks()) {
      const already = pc.getSenders().some((sender) => sender.track?.id === track.id);
      if (!already) {
        pc.addTrack(track, local);
      }
    }
    const video = outgoingVideoTrack();
    if (!video) {
      return;
    }
    const already = pc.getSenders().some((sender) => sender.track?.id === video.id);
    if (!already) {
      pc.addTrack(video, local);
    }
    const screenTrack = screenRef.current?.getVideoTracks()[0];
    if (screenTrack && !pc.getSenders().some((sender) => sender.track?.id === screenTrack.id)) {
      pc.addTrack(screenTrack, screenRef.current as MediaStream);
    }
  }

  async function ensureLocal() {
    if (localRef.current) {
      return localRef.current;
    }
    if (!localPromiseRef.current) {
      localPromiseRef.current = navigator.mediaDevices
        .getUserMedia({ audio: true, video: true })
        .then((stream) => {
          if (leftRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return null;
          }
          stream.getAudioTracks().forEach((track) => {
            track.enabled = !mutedRef.current;
          });
          stream.getVideoTracks().forEach((track) => {
            track.enabled = !cameraRef.current;
          });
          localRef.current = stream;
          setLocalStream(stream);
          return stream;
        })
        .catch((error: unknown) => {
          console.log("getUserMedia failed", error);
          localPromiseRef.current = null;
          return null;
        });
    }
    return localPromiseRef.current;
  }

  async function flushIce(link: RemoteLink) {
    if (!link.pc) {
      return;
    }
    const queued = link.pendingIce.splice(0, link.pendingIce.length);
    for (const candidate of queued) {
      try {
        await link.pc.addIceCandidate(candidate);
      } catch (error) {
        console.log("addIceCandidate failed", error);
      }
    }
  }

  async function sendOffer(remoteId: string) {
    const link = linkFor(remoteId);
    if (!isOfferer(remoteId) || link.offered || leftRef.current) {
      return;
    }
    link.offered = true;
    await ensureLocal();
    if (leftRef.current) {
      return;
    }
    const pc = createPeer(remoteId);
    addLocalTracks(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    publish("offer", {
      roomId: roomRef.current,
      from: clientIdRef.current,
      to: remoteId,
      name: nameRef.current,
      sdp: pc.localDescription?.toJSON(),
    });
  }

  async function acceptOffer(remoteId: string, sdp: RTCSessionDescriptionInit, sharing?: boolean) {
    const link = linkFor(remoteId);
    if (leftRef.current) {
      return;
    }
    if (typeof sharing === "boolean") {
      link.sharing = sharing;
      if (!sharing) {
        link.screen = null;
        link.screenTrack = null;
      }
    }
    const renegotiation = Boolean(link.pc);
    if (renegotiation && link.pc?.signalingState !== "stable") {
      return;
    }
    if (!renegotiation && (link.answered || isOfferer(remoteId))) {
      return;
    }
    link.answered = true;
    const pc = createPeer(remoteId);
    await pc.setRemoteDescription(sdp);
    await ensureLocal();
    if (leftRef.current) {
      return;
    }
    addLocalTracks(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    publish("answer", {
      roomId: roomRef.current,
      from: clientIdRef.current,
      to: remoteId,
      name: nameRef.current,
      sharing: Boolean(screenRef.current),
      sdp: pc.localDescription?.toJSON(),
    });
    await flushIce(link);
  }

  function noteRemote(remoteId: string, payload: Signal) {
    const link = linkFor(remoteId);
    link.name = liveParticipantName(remoteId, payload.name);
    link.muted = Boolean(payload.muted);
    link.cameraOff = Boolean(payload.cameraOff);
    if (typeof payload.sharing === "boolean") {
      link.sharing = payload.sharing;
      if (!payload.sharing) {
        link.screen = null;
        link.screenTrack = null;
      }
    }
    publishRoster();
  }

  useEffect(() => {
    if (!roomId) {
      return;
    }
    let stopped = false;
    const joinedRoom = roomId;
    const selfId = clientIdRef.current;
    leftRef.current = false;
    mutedRef.current = false;
    cameraRef.current = false;
    setMuted(false);
    setCameraOff(false);
    const staged = takeStagedCamera();
    if (staged) {
      localRef.current = staged.stream;
      setLocalStream(staged.stream);
    }

    function hangUp(notify: boolean) {
      if (leftRef.current) {
        if (notify) {
          onEndedRef.current?.();
        }
        return;
      }
      leftRef.current = true;
      publish("leave", { roomId: joinedRoom, clientId: selfId });
      closeAll();
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
      localPromiseRef.current = null;
      screenRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current = null;
      setLocalStream(null);
      setScreenStream(null);
      setSharing(false);
      if (notify) {
        onEndedRef.current?.();
      }
    }

    async function onSignal(envelope: TransportEnvelope) {
      if (stopped || leftRef.current) {
        return;
      }
      const payload = envelope.payload as Signal;
      if (payload.roomId && payload.roomId !== roomRef.current) {
        return;
      }
      if (payload.clientId === selfId || payload.from === selfId) {
        return;
      }
      if (payload.to && payload.to !== selfId) {
        return;
      }
      if (envelope.type === "join" && payload.clientId) {
        noteRemote(payload.clientId, payload);
        if (!announcedRef.current.has(payload.clientId)) {
          announcedRef.current.add(payload.clientId);
          publish("join", {
            roomId: roomRef.current,
            clientId: selfId,
            name: nameRef.current,
            muted: mutedRef.current,
            cameraOff: cameraRef.current,
          });
        }
        await sendOffer(payload.clientId);
        return;
      }
      if (envelope.type === "state" && payload.clientId) {
        noteRemote(payload.clientId, payload);
        return;
      }
      if (envelope.type === "offer" && payload.from && payload.sdp) {
        noteRemote(payload.from, payload);
        await acceptOffer(payload.from, payload.sdp, payload.sharing);
        return;
      }
      if (envelope.type === "answer" && payload.from && payload.sdp) {
        const link = linksRef.current.get(payload.from);
        if (!link?.pc) {
          return;
        }
        if (payload.name) {
          link.name = liveParticipantName(payload.from, payload.name);
        }
        if (typeof payload.sharing === "boolean") {
          link.sharing = payload.sharing;
          if (!payload.sharing) {
            link.screen = null;
            link.screenTrack = null;
          }
        }
        publishRoster();
        await link.pc.setRemoteDescription(payload.sdp);
        await flushIce(link);
        return;
      }
      if (envelope.type === "ice" && payload.candidate && payload.from) {
        const link = linkFor(payload.from);
        if (!link.pc || !link.pc.remoteDescription) {
          link.pendingIce.push(payload.candidate);
          return;
        }
        try {
          await link.pc.addIceCandidate(payload.candidate);
        } catch (error) {
          console.log("addIceCandidate failed", error);
        }
        return;
      }
      if (envelope.type === "leave") {
        const remoteId = payload.clientId || payload.from;
        if (remoteId) {
          dropLink(remoteId);
        }
      }
    }

    const unsubscribe = getTransport().subscribe("call", (envelope) => {
      void onSignal(envelope);
    });
    const unsubscribeConnection = subscribeConnection((phase) => {
      if (stopped || leftRef.current) {
        return;
      }
      if (phase === "reconnecting" || phase === "disconnected") {
        hangUp(true);
      }
    });

    async function start() {
      await ensureLocal();
      if (stopped || leftRef.current) {
        return;
      }
      publish("join", {
        roomId: joinedRoom,
        clientId: selfId,
        name: nameRef.current,
        muted: mutedRef.current,
        cameraOff: cameraRef.current,
      });
    }

    void start();

    return () => {
      stopped = true;
      unsubscribe();
      unsubscribeConnection();
      hangUp(false);
    };
  }, [roomId]);

  function toggleMute() {
    setMuted((value) => {
      const next = !value;
      mutedRef.current = next;
      localRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      publish("state", {
        roomId: roomRef.current,
        clientId: clientIdRef.current,
        name: nameRef.current,
        muted: next,
        cameraOff: cameraRef.current,
      });
      return next;
    });
  }

  function toggleCamera() {
    setCameraOff((value) => {
      const next = !value;
      cameraRef.current = next;
      localRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
      publish("state", {
        roomId: roomRef.current,
        clientId: clientIdRef.current,
        name: nameRef.current,
        muted: mutedRef.current,
        cameraOff: next,
      });
      return next;
    });
  }

  async function renegotiate(remoteId: string) {
    const link = linksRef.current.get(remoteId);
    const pc = link?.pc;
    if (!link || !pc || leftRef.current) {
      return;
    }
    if (pc.signalingState !== "stable") {
      link.needsRenegotiation = true;
      return;
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    publish("offer", {
      roomId: roomRef.current,
      from: clientIdRef.current,
      to: remoteId,
      name: nameRef.current,
      sharing: Boolean(screenRef.current),
      sdp: pc.localDescription?.toJSON(),
    });
  }

  function publishSelf() {
    publish("state", {
      roomId: roomRef.current,
      clientId: clientIdRef.current,
      name: nameRef.current,
      muted: mutedRef.current,
      cameraOff: cameraRef.current,
      sharing: Boolean(screenRef.current),
    });
  }

  async function stopScreenShare() {
    const display = screenRef.current;
    const track = display?.getVideoTracks()[0];
    screenRef.current = null;
    setScreenStream(null);
    setSharing(false);
    if (track) {
      track.onended = null;
      for (const link of linksRef.current.values()) {
        const sender = link.pc?.getSenders().find((item) => item.track?.id === track.id);
        if (sender && link.pc) {
          link.pc.removeTrack(sender);
        }
      }
      track.stop();
    }
    for (const id of linksRef.current.keys()) {
      await renegotiate(id);
    }
    publishSelf();
  }

  async function toggleScreenShare() {
    if (screenRef.current) {
      await stopScreenShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (leftRef.current) {
        display.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = display.getVideoTracks()[0];
      if (!track) {
        return;
      }
      track.contentHint = "detail";
      track.onended = () => {
        void stopScreenShare();
      };
      screenRef.current = display;
      setScreenStream(display);
      setSharing(true);
      for (const [id, link] of linksRef.current) {
        if (!link.pc) {
          continue;
        }
        link.pc.addTrack(track, display);
        await renegotiate(id);
      }
      publishSelf();
    } catch (error) {
      console.log("getDisplayMedia failed", error);
    }
  }

  function leave() {
    if (!roomRef.current || leftRef.current) {
      onEndedRef.current?.();
      return;
    }
    leftRef.current = true;
    publish("leave", { roomId: roomRef.current, clientId: clientIdRef.current });
    closeAll();
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    localPromiseRef.current = null;
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setSharing(false);
    onEndedRef.current?.();
  }

  if (!roomId) {
    return null;
  }

  return {
    muted,
    cameraOff,
    sharing,
    localStream,
    screenStream,
    participants,
    toggleMute,
    toggleCamera,
    toggleScreenShare: () => {
      void toggleScreenShare();
    },
    leave,
  };
}
