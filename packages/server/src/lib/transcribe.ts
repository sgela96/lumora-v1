import { readFile } from 'node:fs/promises';
import { config } from '../config';

export interface TranscriptSegment {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  language?: string;
  segments: TranscriptSegment[];
}

// Speech-to-text for AI Powered. Claude reads text and images, not audio, so the narration of a
// screen recording goes through a dedicated provider first. Both are plain REST calls.

export function transcriptionAvailable(): boolean {
  return config.transcription.provider === 'openai' ? !!config.transcription.openaiKey : !!config.transcription.deepgramKey;
}

export async function transcribe(file: { path: string; mime: string }): Promise<Transcript | undefined> {
  if (!transcriptionAvailable()) return undefined;
  try {
    const audio = await readFile(file.path);
    const result = config.transcription.provider === 'openai' ? await openai(audio, file.mime) : await deepgram(audio, file.mime);
    return result.text.trim() ? result : undefined;
  } catch (error) {
    console.warn('[transcribe]', error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function deepgram(audio: Buffer, mime: string): Promise<Transcript> {
  const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true', utterances: 'true', detect_language: 'true' });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${config.transcription.deepgramKey}`, 'Content-Type': mime },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    results?: {
      channels?: { detected_language?: string; alternatives?: { transcript?: string }[] }[];
      utterances?: { start: number; end: number; transcript: string }[];
    };
  };
  const channel = body.results?.channels?.[0];
  return {
    text: channel?.alternatives?.[0]?.transcript ?? '',
    language: channel?.detected_language,
    segments: (body.results?.utterances ?? []).map((u) => ({ start: u.start, end: u.end, text: u.transcript })),
  };
}

async function openai(audio: Buffer, mime: string): Promise<Transcript> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), mime.includes('mp4') ? 'recording.mp4' : 'recording.webm');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.transcription.openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { text: string; language?: string; segments?: { start: number; end: number; text: string }[] };
  return {
    text: body.text,
    language: body.language,
    segments: (body.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
  };
}
