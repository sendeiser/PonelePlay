import type { SyncRole } from "./protocol";
import { RTC_CONFIGURATION } from "./webrtc-direct";

export interface DirectMediaStats {
  streaming: boolean;
  receiving: boolean;
  viewerCount: number;
  streamLabel: string | null;
  hasAudio: boolean;
  hasVideo: boolean;
  cropApplied: boolean;
}

export interface DirectMediaSignalPayload {
  targetClientId?: string;
  channel: "media";
  signalType: "offer" | "answer" | "candidate" | "bye";
  sdp?: string;
  candidate?: Record<string, unknown>;
  mediaActive?: boolean;
}

export interface DirectMediaStartOptions {
  preferCurrentTab?: boolean;
  cropElement?: HTMLElement | null;
}

export interface DirectMediaStartResult {
  ok: boolean;
  error?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  label: string | null;
  cropApplied: boolean;
}

interface OutboundMediaPeer {
  peerId: string;
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  connected: boolean;
  closed: boolean;
}

interface InboundMediaPeer {
  peerId: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  closed: boolean;
}

interface DisplayCaptureOptions extends DisplayMediaStreamOptions {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
}

interface CropTargetApi {
  fromElement?: (element: Element) => Promise<unknown>;
}

interface CroppableMediaStreamTrack extends MediaStreamTrack {
  cropTo?: (target: unknown) => Promise<void>;
  getSettings(): MediaTrackSettings & { displaySurface?: string };
}

/**
 * Dedicated WebRTC MediaStream manager for Opción 2 (0 ms Cabina -> Web TV Broadcast).
 * Uses `channel: "media"` over the shared Sync WebSocket signaling relay so toggling live
 * video/audio streaming never interrupts the low-latency DataChannel control link.
 */
export class DirectMediaStreamer {
  readonly clientId: string;
  readonly role: SyncRole;

  private readonly onSendSignal: (signal: DirectMediaSignalPayload) => void;
  private readonly onRemoteStreamChange?: (stream: MediaStream | null) => void;
  private readonly onStatsChange?: (stats: DirectMediaStats) => void;

  private localStream: MediaStream | null = null;
  private streamLabel: string | null = null;
  private cropApplied = false;
  private desiredTvPeerIds: string[] = [];

  private outboundPeers = new Map<string, OutboundMediaPeer>();
  private inboundPeer: InboundMediaPeer | null = null;
  private remoteStream: MediaStream | null = null;
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    clientId: string;
    role: SyncRole;
    onSendSignal: (signal: DirectMediaSignalPayload) => void;
    onRemoteStreamChange?: (stream: MediaStream | null) => void;
    onStatsChange?: (stats: DirectMediaStats) => void;
  }) {
    this.clientId = options.clientId;
    this.role = options.role;
    this.onSendSignal = options.onSendSignal;
    this.onRemoteStreamChange = options.onRemoteStreamChange;
    this.onStatsChange = options.onStatsChange;
  }

  getStats(): DirectMediaStats {
    let connectedViewers = 0;
    for (const peer of this.outboundPeers.values()) {
      if (!peer.closed && (peer.connected || peer.pc.connectionState === "connected")) {
        connectedViewers += 1;
      }
    }
    const viewerCount = connectedViewers > 0 ? connectedViewers : this.outboundPeers.size;
    return {
      streaming: Boolean(this.localStream),
      receiving: Boolean(this.remoteStream),
      viewerCount: this.localStream ? viewerCount : 0,
      streamLabel: this.streamLabel,
      hasAudio: Boolean(this.localStream && this.localStream.getAudioTracks().length > 0),
      hasVideo: Boolean(this.localStream && this.localStream.getVideoTracks().length > 0),
      cropApplied: this.cropApplied,
    };
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  isStreaming(): boolean {
    return Boolean(this.localStream);
  }

  async startCapture(options: DirectMediaStartOptions = {}): Promise<DirectMediaStartResult> {
    if (this.role !== "master") {
      return {
        ok: false,
        error: "Solo Cabina (Master) puede iniciar una transmisión en vivo.",
        hasAudio: false,
        hasVideo: false,
        label: null,
        cropApplied: false,
      };
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      return {
        ok: false,
        error: "Tu navegador no soporta captura de pestaña/pantalla (getDisplayMedia).",
        hasAudio: false,
        hasVideo: false,
        label: null,
        cropApplied: false,
      };
    }

    try {
      const captureOpts: DisplayCaptureOptions = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        systemAudio: "include",
        surfaceSwitching: "include",
      };

      if (options.preferCurrentTab) {
        captureOpts.preferCurrentTab = true;
        captureOpts.selfBrowserSurface = "include";
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(captureOpts);

      let cropApplied = false;
      const videoTrack = stream.getVideoTracks()[0] as CroppableMediaStreamTrack | undefined;
      if (videoTrack && options.cropElement) {
        try {
          const settings = videoTrack.getSettings?.();
          const isBrowserTab =
            options.preferCurrentTab === true || settings?.displaySurface === "browser";
          const globalCrop = (globalThis as { CropTarget?: CropTargetApi }).CropTarget;
          if (isBrowserTab && globalCrop?.fromElement && typeof videoTrack.cropTo === "function") {
            const target = await globalCrop.fromElement(options.cropElement);
            await videoTrack.cropTo(target);
            cropApplied = true;
          }
        } catch {
          // Crop fails gracefully if user chose a different tab/window; stream continues intact.
        }
      }

      const firstTrack = stream.getVideoTracks()[0] ?? stream.getAudioTracks()[0] ?? null;
      const label = firstTrack?.label?.trim() || "Transmisión en vivo";
      this.cropApplied = cropApplied;
      this.attachStream(stream, label, cropApplied);

      return {
        ok: true,
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0,
        label,
        cropApplied,
      };
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Compartición cancelada o sin permiso del navegador."
          : err instanceof Error
            ? err.message
            : "No se pudo iniciar la captura multimedia.";
      return {
        ok: false,
        error: msg,
        hasAudio: false,
        hasVideo: false,
        label: null,
        cropApplied: false,
      };
    }
  }

  attachStream(stream: MediaStream, label: string | null = null, cropApplied = false): void {
    this.teardownOutboundOnly(false);
    this.localStream = stream;
    this.streamLabel = label;
    this.cropApplied = cropApplied;

    for (const track of stream.getTracks()) {
      try {
        if ("contentHint" in track) {
          track.contentHint = track.kind === "audio" ? "music" : "motion";
        }
      } catch {
        // Ignore unsupported contentHint implementations
      }
      track.addEventListener("ended", () => {
        if (this.localStream === stream) {
          this.stopCapture();
        }
      });
    }

    this.syncPeers(this.desiredTvPeerIds);
    this.emitStats();
  }

  stopCapture(): void {
    if (!this.localStream && this.outboundPeers.size === 0) return;

    const stream = this.localStream;
    this.localStream = null;
    this.streamLabel = null;
    this.cropApplied = false;

    this.teardownOutboundOnly(true);

    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }

    // Notify any listening TVs globally in case a peer was still negotiating
    this.onSendSignal({
      channel: "media",
      signalType: "bye",
      mediaActive: false,
    });
    this.emitStats();
  }

  syncPeers(tvPeerIds: readonly string[]): void {
    this.desiredTvPeerIds = Array.from(
      new Set(tvPeerIds.filter((id) => Boolean(id) && id !== this.clientId)),
    );

    if (!this.localStream || this.role !== "master" || typeof RTCPeerConnection === "undefined") {
      return;
    }

    const desiredSet = new Set(this.desiredTvPeerIds);
    for (const existingId of Array.from(this.outboundPeers.keys())) {
      if (!desiredSet.has(existingId)) {
        this.closeOutboundPeer(existingId, true);
      }
    }

    for (const tvId of this.desiredTvPeerIds) {
      const existing = this.outboundPeers.get(tvId);
      if (!existing || existing.closed) {
        void this.initiateOfferToTv(tvId);
      }
    }
    this.emitStats();
  }

  async handleSignal(signal: {
    fromClientId: string;
    fromRole: SyncRole;
    channel?: "data" | "media";
    signalType: "offer" | "answer" | "candidate" | "bye" | "direct-ready";
    sdp?: string;
    candidate?: Record<string, unknown>;
    mediaActive?: boolean;
  }): Promise<void> {
    if (signal.channel !== "media") return;
    if (signal.fromClientId === this.clientId) return;

    if (signal.signalType === "bye" || signal.mediaActive === false) {
      if (this.role === "tv") {
        this.closeInboundPeer();
      } else {
        this.closeOutboundPeer(signal.fromClientId, false);
        this.emitStats();
      }
      return;
    }

    if (typeof RTCPeerConnection === "undefined") return;

    if (this.role === "master") {
      const peer = this.outboundPeers.get(signal.fromClientId);
      if (!peer || peer.closed) return;

      if (signal.signalType === "answer" && signal.sdp) {
        try {
          await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          peer.remoteDescSet = true;
          await this.flushCandidates(peer.pc, peer.pendingCandidates);
        } catch {
          this.closeOutboundPeer(signal.fromClientId, false);
        }
        return;
      }

      if (signal.signalType === "candidate" && signal.candidate) {
        const init = signal.candidate as RTCIceCandidateInit;
        if (!peer.remoteDescSet) {
          peer.pendingCandidates.push(init);
        } else {
          try {
            await peer.pc.addIceCandidate(init);
          } catch {
            // Ignore stale ICE candidate
          }
        }
      }
      return;
    }

    if (this.role === "tv") {
      if (signal.signalType === "offer" && signal.sdp && signal.fromRole === "master") {
        this.closeInboundPeer(false);

        const pc = new RTCPeerConnection(RTC_CONFIGURATION);
        const stream = new MediaStream();
        const inbound: InboundMediaPeer = {
          peerId: signal.fromClientId,
          pc,
          stream,
          pendingCandidates: [],
          remoteDescSet: false,
          closed: false,
        };
        this.inboundPeer = inbound;

        pc.ontrack = (ev) => {
          if (inbound.closed || this.inboundPeer !== inbound) return;
          const incomingStream = ev.streams?.[0];
          if (incomingStream) {
            for (const track of incomingStream.getTracks()) {
              if (!stream.getTracks().some((t) => t.id === track.id)) {
                stream.addTrack(track);
              }
            }
          } else if (ev.track && !stream.getTracks().some((t) => t.id === ev.track.id)) {
            stream.addTrack(ev.track);
          }

          if (this.remoteStream !== stream) {
            this.remoteStream = stream;
            this.onRemoteStreamChange?.(stream);
            this.emitStats();
          }

          ev.track.onended = () => {
            if (inbound.closed || this.inboundPeer !== inbound) return;
            const hasLiveTracks = stream.getTracks().some((t) => t.readyState === "live");
            if (!hasLiveTracks) {
              this.closeInboundPeer();
            }
          };
        };

        pc.onicecandidate = (ev) => {
          if (!ev.candidate || inbound.closed) return;
          this.onSendSignal({
            targetClientId: inbound.peerId,
            channel: "media",
            signalType: "candidate",
            candidate: ev.candidate.toJSON() as Record<string, unknown>,
          });
        };

        pc.onconnectionstatechange = () => {
          if (inbound.closed || this.inboundPeer !== inbound) return;
          if (pc.connectionState === "connected") {
            this.clearDisconnectGraceTimer();
            this.emitStats();
          } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            this.closeInboundPeer();
          } else if (pc.connectionState === "disconnected") {
            this.scheduleDisconnectGrace(() => {
              if (this.inboundPeer === inbound && pc.connectionState !== "connected") {
                this.closeInboundPeer();
              }
            });
          }
        };

        try {
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          inbound.remoteDescSet = true;
          await this.flushCandidates(pc, inbound.pendingCandidates);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) {
            this.onSendSignal({
              targetClientId: inbound.peerId,
              channel: "media",
              signalType: "answer",
              sdp: answer.sdp,
              mediaActive: true,
            });
          }
        } catch {
          this.closeInboundPeer();
        }
        return;
      }

      if (signal.signalType === "candidate" && signal.candidate && this.inboundPeer) {
        const inbound = this.inboundPeer;
        if (inbound.closed || inbound.peerId !== signal.fromClientId) return;
        const init = signal.candidate as RTCIceCandidateInit;
        if (!inbound.remoteDescSet) {
          inbound.pendingCandidates.push(init);
        } else {
          try {
            await inbound.pc.addIceCandidate(init);
          } catch {
            // Ignore stale ICE candidate
          }
        }
      }
    }
  }

  dispose(): void {
    this.stopCapture();
    this.closeInboundPeer();
  }

  private async initiateOfferToTv(tvPeerId: string): Promise<void> {
    if (!this.localStream || typeof RTCPeerConnection === "undefined") return;

    this.closeOutboundPeer(tvPeerId, false);
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const peer: OutboundMediaPeer = {
      peerId: tvPeerId,
      pc,
      pendingCandidates: [],
      remoteDescSet: false,
      connected: false,
      closed: false,
    };
    this.outboundPeers.set(tvPeerId, peer);

    const stream = this.localStream;
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      void this.tuneSenderBitrate(sender, track.kind);
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate || peer.closed) return;
      this.onSendSignal({
        targetClientId: tvPeerId,
        channel: "media",
        signalType: "candidate",
        candidate: ev.candidate.toJSON() as Record<string, unknown>,
      });
    };

    pc.onconnectionstatechange = () => {
      if (peer.closed) return;
      peer.connected = pc.connectionState === "connected";
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closeOutboundPeer(tvPeerId, false);
      }
      this.emitStats();
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (offer.sdp && !peer.closed) {
        this.onSendSignal({
          targetClientId: tvPeerId,
          channel: "media",
          signalType: "offer",
          sdp: offer.sdp,
          mediaActive: true,
        });
      }
    } catch {
      this.closeOutboundPeer(tvPeerId, false);
    }
  }

  private async tuneSenderBitrate(sender: RTCRtpSender, kind: string): Promise<void> {
    if (typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") {
      return;
    }
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      if (kind === "audio") {
        params.encodings[0].maxBitrate = 192_000;
      } else if (kind === "video") {
        params.encodings[0].maxBitrate = 3_000_000;
        params.degradationPreference = "maintain-framerate";
      }
      await sender.setParameters(params);
    } catch {
      // Browser does not allow tweaking this sender yet; defaults apply cleanly.
    }
  }

  private async flushCandidates(
    pc: RTCPeerConnection,
    queue: RTCIceCandidateInit[],
  ): Promise<void> {
    while (queue.length > 0) {
      const cand = queue.shift();
      if (!cand) continue;
      try {
        await pc.addIceCandidate(cand);
      } catch {
        // Ignore invalid candidate
      }
    }
  }

  private teardownOutboundOnly(notifyPeers: boolean): void {
    for (const peerId of Array.from(this.outboundPeers.keys())) {
      this.closeOutboundPeer(peerId, notifyPeers);
    }
    this.outboundPeers.clear();
  }

  private closeOutboundPeer(peerId: string, notifyPeer: boolean): void {
    const peer = this.outboundPeers.get(peerId);
    if (!peer) return;
    peer.closed = true;
    peer.connected = false;
    this.outboundPeers.delete(peerId);
    if (notifyPeer) {
      try {
        this.onSendSignal({
          targetClientId: peerId,
          channel: "media",
          signalType: "bye",
          mediaActive: false,
        });
      } catch {
        // ignore
      }
    }
    try {
      peer.pc.close();
    } catch {
      // ignore
    }
  }

  private closeInboundPeer(emitClear = true): void {
    this.clearDisconnectGraceTimer();
    const peer = this.inboundPeer;
    this.inboundPeer = null;
    if (peer) {
      peer.closed = true;
      try {
        peer.pc.close();
      } catch {
        // ignore
      }
    }
    const hadStream = Boolean(this.remoteStream);
    this.remoteStream = null;
    if (emitClear && hadStream) {
      this.onRemoteStreamChange?.(null);
      this.emitStats();
    }
  }

  private scheduleDisconnectGrace(fn: () => void): void {
    this.clearDisconnectGraceTimer();
    this.disconnectGraceTimer = setTimeout(fn, 2500);
  }

  private clearDisconnectGraceTimer(): void {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  }

  private emitStats(): void {
    this.onStatsChange?.(this.getStats());
  }
}
