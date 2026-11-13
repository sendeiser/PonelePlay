import {
  computeClockOffsetSample,
  mergeClockOffset,
  type ClockSyncEstimate,
  type SyncInboundMessage,
  type SyncOutboundMessage,
  type SyncPeerInfo,
  type SyncRole,
} from "./protocol";

export interface DirectP2PStats {
  enabled: boolean;
  broadcastSupported: boolean;
  rtcSupported: boolean;
  broadcastPeerCount: number;
  dataChannelCount: number;
  totalPeerAttempts: number;
  bestDirectRttMs: number | null;
  directClock: ClockSyncEstimate | null;
}

export type DirectWirePacket =
  | {
      kind: "hello";
      fromClientId: string;
      role: SyncRole;
    }
  | {
      kind: "hello-ack";
      fromClientId: string;
      role: SyncRole;
    }
  | {
      kind: "bye";
      fromClientId: string;
      role: SyncRole;
    }
  | {
      kind: "msg";
      msgId: string;
      fromClientId: string;
      fromRole: SyncRole;
      via: "bc" | "rtc";
      payload: SyncOutboundMessage | SyncInboundMessage;
    };

interface ManagedRtcPeer {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
  closed: boolean;
}

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 2,
};

export interface DirectP2PManagerOptions {
  slug: string;
  clientId: string;
  role: SyncRole;
  onSendSignal: (signal: {
    targetClientId: string;
    signalType: "offer" | "answer" | "candidate" | "bye";
    sdp?: string;
    candidate?: Record<string, unknown>;
  }) => void;
  onDirectMessage: (
    payload: SyncOutboundMessage | SyncInboundMessage,
    meta: { via: "bc" | "rtc"; fromClientId: string; fromRole: SyncRole },
  ) => void;
  onStatsChange?: (stats: DirectP2PStats) => void;
}

/**
 * Coordinates direct same-PC (BroadcastChannel) and cross-device local Wi-Fi (WebRTC DataChannel)
 * delivery alongside Cloud WebSocket fallback. Safe to instantiate in SSR/Node tests.
 */
export class DirectP2PManager {
  private readonly slug: string;
  private readonly clientId: string;
  private readonly role: SyncRole;
  private readonly onSendSignal: DirectP2PManagerOptions["onSendSignal"];
  private readonly onDirectMessage: DirectP2PManagerOptions["onDirectMessage"];
  private readonly onStatsChange?: DirectP2PManagerOptions["onStatsChange"];

  private enabled = false;
  private bc: BroadcastChannel | null = null;
  private bcPeers = new Map<string, SyncRole>();
  private rtcPeers = new Map<string, ManagedRtcPeer>();
  private seenMsgIds: string[] = [];
  private seenMsgSet = new Set<string>();
  private directClock: ClockSyncEstimate | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DirectP2PManagerOptions) {
    this.slug = options.slug;
    this.clientId = options.clientId;
    this.role = options.role;
    this.onSendSignal = options.onSendSignal;
    this.onDirectMessage = options.onDirectMessage;
    this.onStatsChange = options.onStatsChange;
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.openBroadcastChannel();
    if (!this.pingTimer) {
      this.pingTimer = setInterval(() => {
        if (this.hasOpenPeer()) {
          this.sendClockPing();
        }
      }, 6_000);
    }
    this.emitStats();
  }

  stop(): void {
    if (!this.enabled && this.rtcPeers.size === 0 && !this.bc) return;
    this.enabled = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const peerId of Array.from(this.rtcPeers.keys())) {
      this.closeRtcPeer(peerId, true);
    }
    this.bcPeers.clear();
    if (this.bc) {
      try {
        this.bc.postMessage({
          kind: "bye",
          fromClientId: this.clientId,
          role: this.role,
        } satisfies DirectWirePacket);
      } catch {
        // Ignore post errors during close
      }
      try {
        this.bc.close();
      } catch {
        // Ignore close errors
      }
      this.bc = null;
    }
    this.directClock = null;
    this.emitStats();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  hasOpenPeer(): boolean {
    if (this.bc && this.bcPeers.size > 0) return true;
    for (const peer of this.rtcPeers.values()) {
      if (peer.dc?.readyState === "open") return true;
    }
    return false;
  }

  hasOpenRtcDataChannel(): boolean {
    for (const peer of this.rtcPeers.values()) {
      if (peer.dc?.readyState === "open") return true;
    }
    return false;
  }

  getBroadcastPeerIds(filterRole?: SyncRole): string[] {
    const ids: string[] = [];
    for (const [peerId, peerRole] of this.bcPeers.entries()) {
      if (!filterRole || peerRole === filterRole) {
        ids.push(peerId);
      }
    }
    return ids;
  }

  getOpenPeerClientIds(): string[] {
    const ids = new Set<string>(this.getBroadcastPeerIds("tv"));
    for (const peer of this.rtcPeers.values()) {
      if (!peer.closed && peer.dc?.readyState === "open") {
        ids.add(peer.peerId);
      }
    }
    return Array.from(ids);
  }

  getDirectClock(): ClockSyncEstimate | null {
    return this.directClock;
  }

  getStats(): DirectP2PStats {
    let dataChannelCount = 0;
    for (const peer of this.rtcPeers.values()) {
      if (peer.dc?.readyState === "open") dataChannelCount += 1;
    }
    return {
      enabled: this.enabled,
      broadcastSupported: typeof BroadcastChannel !== "undefined",
      rtcSupported: typeof RTCPeerConnection !== "undefined",
      broadcastPeerCount: this.bcPeers.size,
      dataChannelCount,
      totalPeerAttempts: this.rtcPeers.size,
      bestDirectRttMs: this.directClock?.bestRttMs ?? null,
      directClock: this.directClock ? { ...this.directClock } : null,
    };
  }

  /**
   * Master maintains direct WebRTC peer connections to active TV peers.
   */
  syncPeers(peers: SyncPeerInfo[]): void {
    if (!this.enabled || this.role !== "master") return;
    if (typeof RTCPeerConnection === "undefined") return;

    const desiredTvIds = new Set<string>();
    for (const peer of peers) {
      if (peer.role === "tv" && peer.clientId && peer.clientId !== this.clientId) {
        desiredTvIds.add(peer.clientId);
      }
    }

    // Remove peers no longer present in room
    for (const existingId of Array.from(this.rtcPeers.keys())) {
      if (!desiredTvIds.has(existingId)) {
        this.closeRtcPeer(existingId, false);
      }
    }

    // Initiate offers to newly seen TVs
    for (const tvId of desiredTvIds) {
      const existing = this.rtcPeers.get(tvId);
      if (!existing || existing.closed) {
        void this.initiateOfferToPeer(tvId);
      }
    }
  }

  /**
   * Sends a message over all available direct links (BroadcastChannel + open RTCDataChannels).
   * Returns true if at least one direct TV/Master peer is connected and targeted.
   */
  sendPayload(payload: SyncOutboundMessage | SyncInboundMessage, preferBroadcast = true): boolean {
    if (!this.enabled) return false;
    let delivered = false;

    if (preferBroadcast && this.bc && this.bcPeers.size > 0) {
      const packet: DirectWirePacket = {
        kind: "msg",
        msgId: this.nextMsgId(),
        fromClientId: this.clientId,
        fromRole: this.role,
        via: "bc",
        payload,
      };
      try {
        this.bc.postMessage(packet);
        delivered = true;
      } catch {
        // Ignore BroadcastChannel post failure
      }
    }

    for (const peer of this.rtcPeers.values()) {
      if (peer.dc?.readyState === "open") {
        const packet: DirectWirePacket = {
          kind: "msg",
          msgId: this.nextMsgId(),
          fromClientId: this.clientId,
          fromRole: this.role,
          via: "rtc",
          payload,
        };
        try {
          peer.dc.send(JSON.stringify(packet));
          delivered = true;
        } catch {
          // Channel closing/congested; Cloud mirror handles continuity
        }
      }
    }

    return delivered;
  }

  sendClockPing(): boolean {
    return this.sendPayload({
      type: "clock:ping",
      clientSentMs: Date.now(),
    });
  }

  async handleSignal(signal: {
    fromClientId: string;
    fromRole: SyncRole;
    signalType: "offer" | "answer" | "candidate" | "bye" | "direct-ready";
    sdp?: string;
    candidate?: Record<string, unknown>;
  }): Promise<void> {
    if (signal.fromClientId === this.clientId) return;
    if (typeof RTCPeerConnection === "undefined") return;

    // Auto-start passive answerer on TV when master sends an offer
    if (!this.enabled && this.role === "tv" && signal.signalType === "offer") {
      this.start();
    }
    if (!this.enabled) return;

    if (signal.signalType === "bye") {
      this.closeRtcPeer(signal.fromClientId, false);
      return;
    }

    if (signal.signalType === "offer" && signal.sdp && this.role === "tv") {
      await this.acceptOfferFromMaster(signal.fromClientId, signal.sdp);
      return;
    }

    const peer = this.rtcPeers.get(signal.fromClientId);
    if (!peer || peer.closed) return;

    if (signal.signalType === "answer" && signal.sdp) {
      try {
        if (peer.pc.signalingState === "have-local-offer") {
          await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          peer.remoteDescSet = true;
          await this.flushCandidates(peer);
        }
      } catch {
        // Ignore transient glare/answer error
      }
      return;
    }

    if (signal.signalType === "candidate" && signal.candidate) {
      const init = signal.candidate as RTCIceCandidateInit;
      if (peer.remoteDescSet) {
        try {
          await peer.pc.addIceCandidate(init);
        } catch {
          // Ignore invalid/late ICE candidate
        }
      } else {
        peer.pendingCandidates.push(init);
      }
    }
  }

  private openBroadcastChannel(): void {
    if (typeof BroadcastChannel === "undefined") return;
    if (this.bc) return;

    try {
      const bc = new BroadcastChannel(`poneleplay-direct:${this.slug}`);
      this.bc = bc;
      bc.onmessage = (ev: MessageEvent<DirectWirePacket>) => {
        this.handlePacket(ev.data, "bc");
      };
      bc.postMessage({
        kind: "hello",
        fromClientId: this.clientId,
        role: this.role,
      } satisfies DirectWirePacket);
    } catch {
      this.bc = null;
    }
  }

  private async initiateOfferToPeer(peerId: string): Promise<void> {
    this.closeRtcPeer(peerId, false);
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const dc = pc.createDataChannel("poneleplay-direct", { ordered: true });
    const managed: ManagedRtcPeer = {
      peerId,
      pc,
      dc,
      pendingCandidates: [],
      remoteDescSet: false,
      closed: false,
    };
    this.rtcPeers.set(peerId, managed);
    this.wirePeerLifecycle(managed);
    this.wireDataChannel(managed, dc);
    this.emitStats();

    try {
      const offer = await pc.createOffer();
      if (managed.closed) return;
      await pc.setLocalDescription(offer);
      if (offer.sdp) {
        this.onSendSignal({
          targetClientId: peerId,
          signalType: "offer",
          sdp: offer.sdp,
        });
      }
    } catch {
      this.closeRtcPeer(peerId, false);
    }
  }

  private async acceptOfferFromMaster(peerId: string, sdp: string): Promise<void> {
    this.closeRtcPeer(peerId, false);
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    const managed: ManagedRtcPeer = {
      peerId,
      pc,
      dc: null,
      pendingCandidates: [],
      remoteDescSet: false,
      closed: false,
    };
    this.rtcPeers.set(peerId, managed);
    this.wirePeerLifecycle(managed);
    pc.ondatachannel = (ev) => {
      if (managed.closed) return;
      managed.dc = ev.channel;
      this.wireDataChannel(managed, ev.channel);
    };
    this.emitStats();

    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      managed.remoteDescSet = true;
      await this.flushCandidates(managed);
      const answer = await pc.createAnswer();
      if (managed.closed) return;
      await pc.setLocalDescription(answer);
      if (answer.sdp) {
        this.onSendSignal({
          targetClientId: peerId,
          signalType: "answer",
          sdp: answer.sdp,
        });
      }
    } catch {
      this.closeRtcPeer(peerId, false);
    }
  }

  private wirePeerLifecycle(managed: ManagedRtcPeer): void {
    managed.pc.onicecandidate = (ev) => {
      if (managed.closed || !ev.candidate) return;
      this.onSendSignal({
        targetClientId: managed.peerId,
        signalType: "candidate",
        candidate: ev.candidate.toJSON() as Record<string, unknown>,
      });
    };

    managed.pc.onconnectionstatechange = () => {
      const st = managed.pc.connectionState;
      if (st === "failed" || st === "closed") {
        this.closeRtcPeer(managed.peerId, false);
      } else {
        this.emitStats();
      }
    };
  }

  private wireDataChannel(managed: ManagedRtcPeer, dc: RTCDataChannel): void {
    dc.onopen = () => {
      if (managed.closed) return;
      if (this.role === "tv") {
        // Immediate direct RTT burst over DataChannel to lock Cabina clock offset
        for (const delayMs of [0, 120, 350]) {
          setTimeout(() => {
            if (!managed.closed && dc.readyState === "open") {
              this.sendClockPing();
            }
          }, delayMs);
        }
      }
      this.emitStats();
    };
    dc.onclose = () => {
      this.emitStats();
    };
    dc.onerror = () => {
      this.emitStats();
    };
    dc.onmessage = (ev: MessageEvent<string>) => {
      if (typeof ev.data !== "string") return;
      try {
        const packet = JSON.parse(ev.data) as DirectWirePacket;
        this.handlePacket(packet, "rtc");
      } catch {
        // Ignore malformed direct frame
      }
    };
  }

  private handlePacket(packet: DirectWirePacket, expectedVia: "bc" | "rtc"): void {
    if (!packet || typeof packet !== "object") return;
    if (packet.fromClientId === this.clientId) return;

    if (packet.kind === "hello") {
      if (expectedVia === "bc") {
        this.bcPeers.set(packet.fromClientId, packet.role);
        this.bc?.postMessage({
          kind: "hello-ack",
          fromClientId: this.clientId,
          role: this.role,
        } satisfies DirectWirePacket);
        if (this.role === "tv") {
          // BroadcastChannel shares exact OS clock with Cabina tab; still measure IPC RTT cleanly
          this.sendClockPing();
        }
        this.emitStats();
      }
      return;
    }

    if (packet.kind === "hello-ack") {
      if (expectedVia === "bc") {
        this.bcPeers.set(packet.fromClientId, packet.role);
        if (this.role === "tv") {
          this.sendClockPing();
        }
        this.emitStats();
      }
      return;
    }

    if (packet.kind === "bye") {
      if (expectedVia === "bc" && this.bcPeers.delete(packet.fromClientId)) {
        this.emitStats();
      }
      return;
    }

    if (packet.kind !== "msg" || !packet.payload) return;
    if (this.hasSeenMsg(packet.msgId)) return;

    if (packet.payload.type === "clock:ping") {
      // Master (or peer) answers clock:ping immediately using its local clock
      if (this.role === "master") {
        this.sendPayload({
          type: "clock:pong",
          clientSentMs: packet.payload.clientSentMs,
          serverNowMs: Date.now(),
        });
      }
      return;
    }

    if (packet.payload.type === "clock:pong") {
      const sample = computeClockOffsetSample(
        packet.payload.clientSentMs,
        packet.payload.serverNowMs,
        Date.now(),
      );
      this.directClock = mergeClockOffset(this.directClock, sample);
      this.emitStats();
      return;
    }

    this.onDirectMessage(packet.payload, {
      via: expectedVia,
      fromClientId: packet.fromClientId,
      fromRole: packet.fromRole,
    });
  }

  private async flushCandidates(managed: ManagedRtcPeer): Promise<void> {
    if (managed.pendingCandidates.length === 0) return;
    const queued = managed.pendingCandidates.splice(0, managed.pendingCandidates.length);
    for (const candidate of queued) {
      try {
        await managed.pc.addIceCandidate(candidate);
      } catch {
        // Ignore stale candidate
      }
    }
  }

  private closeRtcPeer(peerId: string, notifyBye: boolean): void {
    const existing = this.rtcPeers.get(peerId);
    if (!existing) return;
    existing.closed = true;
    this.rtcPeers.delete(peerId);
    if (notifyBye) {
      try {
        this.onSendSignal({ targetClientId: peerId, signalType: "bye" });
      } catch {
        // Ignore signaling send errors during teardown
      }
    }
    try {
      existing.dc?.close();
    } catch {
      // Ignore
    }
    try {
      existing.pc.close();
    } catch {
      // Ignore
    }
    this.emitStats();
  }

  private nextMsgId(): string {
    return `${this.clientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private hasSeenMsg(msgId: string): boolean {
    if (!msgId) return false;
    if (this.seenMsgSet.has(msgId)) return true;
    this.seenMsgSet.add(msgId);
    this.seenMsgIds.push(msgId);
    if (this.seenMsgIds.length > 200) {
      const evicted = this.seenMsgIds.shift();
      if (evicted) this.seenMsgSet.delete(evicted);
    }
    return false;
  }

  private emitStats(): void {
    this.onStatsChange?.(this.getStats());
  }
}
