// THE PHONE'S LIVE FEED, PEER TO PEER (8 Nov 2026, lib/cameraSignal.js is
// the post box). The same loop on both sides: post what WebRTC gives you,
// poll for what the other side left, feed it in. The phone offers once it
// has its camera; the Mac answers when it sees an offer. Either side's
// failure leaves the frame relay in charge (the Mac shows the relayed frames
// until a remote track arrives), so the picture is never missing, only
// slower. `signal(body)` and `read(role, since)` are the app's two calls.

const POLL_MS = 400;

export function createPeer({ role, signal, read, onTrack = null, onState = null, stream = null, stun = ['stun:stun.l.google.com:19302'] }) {
  if (typeof RTCPeerConnection === 'undefined') return { stop: () => {}, supported: false };
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stun }] });
  let since = 0;
  let live = true;
  let timer = null;
  const pending = [];
  const tell = (s) => { try { onState?.(s); } catch { /* a listener never costs the call */ } };
  pc.onicecandidate = (e) => { if (e.candidate) signal({ role, type: 'candidate', candidate: e.candidate.toJSON() }).catch(() => {}); };
  pc.onconnectionstatechange = () => tell(pc.connectionState);
  if (onTrack) pc.ontrack = (e) => { try { onTrack(e.streams[0] || new MediaStream([e.track])); } catch { /* ignore */ } };
  if (stream) for (const t of stream.getTracks()) pc.addTrack(t, stream);
  const addCands = async (cands) => { for (const c of cands || []) { try { await pc.addIceCandidate(c); } catch { pending.push(c); } } };
  const poll = async () => {
    if (!live) return;
    try {
      const r = await read(role, since);
      if (!live) return;
      if (r?.seq) since = Math.max(since, r.seq);
      if (r?.hungUp) { tell('hungup'); stop(); return; }
      if (role === 'mac' && r?.offer && pc.signalingState === 'stable' && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription({ type: 'offer', sdp: r.offer });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signal({ role, type: 'answer', sdp: answer.sdp });
        await addCands(pending.splice(0));
      }
      if (role === 'phone' && r?.answer && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: r.answer });
        await addCands(pending.splice(0));
      }
      if (pc.currentRemoteDescription) await addCands(r?.candidates); else pending.push(...(r?.candidates || []));
    } catch { /* the next poll */ }
    if (live) timer = setTimeout(poll, POLL_MS);
  };
  const start = async () => {
    if (role === 'phone') {
      const offer = await pc.createOffer({ offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      await signal({ role, type: 'offer', sdp: offer.sdp });
    }
    poll();
  };
  const stop = () => { if (!live) return; live = false; clearTimeout(timer); try { pc.close(); } catch { /* closed */ } };
  start().catch(() => { tell('failed'); });
  return { stop, supported: true, bye: () => signal({ role, type: 'bye' }).catch(() => {}) };
}
