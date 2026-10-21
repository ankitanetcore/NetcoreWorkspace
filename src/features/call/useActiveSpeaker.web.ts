import { useEffect, useRef, useState } from "react";

interface SpeakerTile {
  id: string;
  muted: boolean;
  stream: unknown;
}

export function useActiveSpeaker(tiles: SpeakerTile[]): { id: string | null; speaking: boolean } {
  const [speaker, setSpeaker] = useState<{ id: string | null; speaking: boolean }>({ id: null, speaking: false });
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const key = tiles
    .map((tile) => {
      const stream = tile.stream instanceof MediaStream ? tile.stream : null;
      const tracks = stream?.getAudioTracks().map((track) => track.id).join(".") ?? "";
      return `${tile.id}:${tile.muted ? "m" : "o"}:${tracks}`;
    })
    .join("|");

  useEffect(() => {
    if (typeof AudioContext === "undefined") {
      return;
    }
    const sources = tilesRef.current.flatMap((tile) => {
      if (tile.muted || !(tile.stream instanceof MediaStream)) {
        return [];
      }
      const tracks = tile.stream.getAudioTracks().filter((track) => track.readyState === "live" && track.enabled);
      if (tracks.length === 0) {
        return [];
      }
      return [{ id: tile.id, stream: new MediaStream(tracks) }];
    });
    if (sources.length === 0) {
      return;
    }
    const ctx = new AudioContext();
    const nodes = sources.map((source) => {
      const media = ctx.createMediaStreamSource(source.stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      media.connect(analyser);
      return { id: source.id, analyser, media, data: new Uint8Array(analyser.fftSize) };
    });
    let quietSince = 0;
    const timer = window.setInterval(() => {
      let bestId: string | null = null;
      let best = 0.025;
      for (const node of nodes) {
        node.analyser.getByteTimeDomainData(node.data);
        let sum = 0;
        for (const value of node.data) {
          const sample = (value - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / node.data.length);
        if (rms > best) {
          best = rms;
          bestId = node.id;
        }
      }
      if (bestId) {
        quietSince = 0;
        const nextId = bestId;
        setSpeaker((current) => (current.id === nextId && current.speaking ? current : { id: nextId, speaking: true }));
        return;
      }
      if (!quietSince) {
        quietSince = Date.now();
      }
      if (Date.now() - quietSince > 700) {
        setSpeaker((current) => (current.speaking ? { id: current.id, speaking: false } : current));
      }
    }, 200);
    return () => {
      window.clearInterval(timer);
      for (const node of nodes) {
        node.media.disconnect();
      }
      void ctx.close();
    };
  }, [key]);

  return speaker;
}
