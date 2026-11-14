// Say it (Labs beta, Bible › Say it): the mic in the capture box. Whisper writes it down (any language, mixed is fine),
// Haiku turns the words into thoughts, and you check every one before it's saved. Ported from Nudge! 2.13 (src/lib/ai.ts).
import { db, getSettings } from '../db/db';
import type { Category, SayItem, ThoughtType } from '../db/types';
import { cloud } from './cloud';

export const MAX_SECS = 120;

export async function sayOn(): Promise<boolean> {
  return cloud.get().signedIn && !!(await getSettings()).labsSay;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) cloud.set({ signedIn: false });
  if (!res.ok) throw Object.assign(new Error(data.error || 'server'), { code: res.status, reason: data.error });
  return data as T;
}

/** Gentle words for what went wrong, and what didn't change. */
export function sayError(e: unknown): string {
  const r = (e as { reason?: string })?.reason;
  if (r === 'ai-off') return 'Say it isn’t set up on the server yet. Nothing was saved; typing still works.';
  if ((e as { code?: number })?.code === 401) return 'Sign in again in Settings › Sync to use this. Your words are kept.';
  if (!navigator.onLine) return 'You’re offline. Type it instead; nothing was lost.';
  return 'Couldn’t catch that this time. Nothing was saved; try again or type it.';
}

// ── Recording ──
export interface Recorder { stop(): Promise<Blob>; cancel(): void; level(): number }

export async function startRecording(maxMs: number, onAuto: () => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MR?.isTypeSupported?.(t)) ?? '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  // A simple level meter (reduced motion: the bars stay still)
  let analyser: AnalyserNode | null = null, ctx: AudioContext | null = null;
  try { ctx = new AudioContext(); void ctx.resume().catch(() => {}); analyser = ctx.createAnalyser(); analyser.fftSize = 256; ctx.createMediaStreamSource(stream).connect(analyser); } catch { /* no meter */ }
  const buf = new Uint8Array(128);
  const end = () => { stream.getTracks().forEach((t) => t.stop()); void ctx?.close().catch(() => {}); };
  const timer = window.setTimeout(onAuto, maxMs);
  rec.start();
  return {
    level: () => { if (!analyser) return 0.3; analyser.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return Math.min(1, m / 64); },
    stop: () => new Promise<Blob>((resolve) => { clearTimeout(timer); rec.onstop = () => { end(); resolve(new Blob(parts, { type: rec.mimeType || type || 'audio/webm' })); }; rec.stop(); }),
    cancel: () => { clearTimeout(timer); rec.onstop = () => end(); try { rec.stop(); } catch { end(); } },
  };
}

const toB64 = (b: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => no(r.error); r.readAsDataURL(b); });

export async function transcribe(blob: Blob, secs: number): Promise<string> {
  // A few of your own thought words help Whisper spell names, places and brands
  const hints = (await db.thoughts.orderBy('updatedAt').reverse().limit(30).toArray()).filter((t) => !t.deletedAt).map((t) => t.text.slice(0, 60));
  const { text } = await post<{ text: string }>('/ai/voice', { audio: await toB64(blob), mime: blob.type, hints, secs: Math.round(secs) });
  return text;
}

/** Words → thoughts to check. Category only when you gave one; steps when you listed them. */
export async function toThoughts(text: string, mode: 'speech' | 'lines', list: ThoughtType): Promise<SayItem[]> {
  const cats = (await db.categories.toArray()) as Category[];
  const out = await post<{ thoughts?: SayItem[] }>('/ai/thoughts', { mode, text, list, categories: cats.map((c) => ({ id: c.id, name: c.name })) });
  return (out.thoughts ?? []).filter((t) => t?.text?.trim());
}
