export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** The user's voice was recorded too. */
  hasAudio: boolean;
}

export interface RecorderOptions {
  maxSeconds: number;
  microphone: boolean;
  onTick: (elapsedMs: number) => void;
  /** Called when the recording ends by itself (time limit or "Stop sharing" in the browser). */
  onAutoStop: () => void;
}

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];

export function isRecordingSupported(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';
}

export class ScreenRecorder {
  private recorder?: MediaRecorder;
  private streams: MediaStream[] = [];
  private chunks: Blob[] = [];
  private startedAt = 0;
  private ticker?: number;
  private limit?: number;
  private result?: Promise<Recording>;
  private hasAudio = false;

  get startTime(): number {
    return this.startedAt;
  }

  async start(options: RecorderOptions): Promise<void> {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: 24 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions);
    this.streams.push(display);

    const tracks: MediaStreamTrack[] = [...display.getVideoTracks()];
    if (options.microphone) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        this.streams.push(mic);
        tracks.push(...mic.getAudioTracks());
        this.hasAudio = mic.getAudioTracks().length > 0;
      } catch {
        // Recording without voice is still useful.
      }
    }

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_500_000,
    });
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.result = new Promise<Recording>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'video/webm';
        resolve({ blob: new Blob(this.chunks, { type }), mimeType: type, durationMs: Date.now() - this.startedAt, hasAudio: this.hasAudio });
      };
    });

    display.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') options.onAutoStop();
    });

    this.startedAt = Date.now();
    recorder.start(1000);
    this.ticker = window.setInterval(() => options.onTick(Date.now() - this.startedAt), 250);
    if (options.maxSeconds > 0) {
      this.limit = window.setTimeout(() => options.onAutoStop(), options.maxSeconds * 1000);
    }
  }

  async stop(): Promise<Recording> {
    window.clearInterval(this.ticker);
    window.clearTimeout(this.limit);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    if (!this.result) throw new Error('Recording was not started');
    return this.result;
  }

  cancel(): void {
    window.clearInterval(this.ticker);
    window.clearTimeout(this.limit);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
  }
}
