let audio: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function context() {
  if (typeof window === "undefined") {
    return null;
  }
  const Ctx = window.AudioContext;
  if (!Ctx) {
    return null;
  }
  if (!audio) {
    audio = new Ctx();
  }
  return audio;
}

export function primeRingtone() {
  const ctx = context();
  if (ctx?.state === "suspended") {
    void ctx.resume();
  }
}

function beep(ctx: AudioContext, start: number, frequency: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.06, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.3);
}

function chime() {
  const ctx = context();
  if (!ctx) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const now = ctx.currentTime;
  beep(ctx, now, 523);
  beep(ctx, now + 0.34, 659);
}

export function startRingtone() {
  if (timer) {
    return;
  }
  chime();
  timer = setInterval(chime, 2200);
}

export function stopRingtone() {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
}
