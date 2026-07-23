import { useRef } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { Clock } from '../Clock.jsx';
import { useDictation } from '../useDictation.js';

const M = "var(--nv-font-mono)";

// Ask Nova — speak (or type) a question; a read-only session over the real
// vault answers it, and the reply is spoken back (ElevenLabs when the key is
// configured, the browser's own engine otherwise). Demo mode keeps the old
// scripted preview and says so on the banner.

function RailRow({ label, value, tone, barPct }) {
  return (
    <div>
      <div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>
        <span>{label}</span><span style={{ color: tone || 'color-mix(in srgb, var(--nv-ink) 85%, transparent)' }}>{value}</span>
      </div>
      <div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-cy) 14%, transparent)")}>
        <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--nv-cy)', transition: 'width .4s' }}></div>
      </div>
    </div>
  );
}

export function Voice({ v }) {
  const inputRef = useRef('');
  inputRef.current = v.orbInput;
  const sendRef = useRef(v.sendOrb);
  sendRef.current = v.sendOrb;
  const dict = useDictation(
    () => '', // each spoken question starts clean
    (text) => v.setOrbInputValue(text),
    () => { if (inputRef.current.trim()) sendRef.current(); }, // recognition end = ask
    {
      continuous: false, // one-shot: silence ends the take (works on iOS)
      onError: (err) => v.dictationError(err),
    },
  );

  const caption = dict.on ? 'LISTENING…'
    : v.voiceBusy ? 'READING THE VAULT…'
    : v.voiceSpeaking ? 'SPEAKING'
    : v.voiceLive ? 'TAP THE MIC OR TYPE' : 'STANDING BY';

  return (
    <div style={v.wrapVoice} data-screen-label="Voice">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
          <span style={css(`font:500 11px ${M};letter-spacing:.14em;color:var(--nv-acc)`)}>II.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css(`font:500 10px ${M};letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>NEURAL LINK · VOICE</span>
          <span style={{ font: `500 9px ${M}`, letterSpacing: '.14em', padding: '5px 10px', borderRadius: '7px', border: `1px solid color-mix(in srgb, ${v.voiceBadge.tone} 45%, transparent)`, color: v.voiceBadge.tone, background: `color-mix(in srgb, ${v.voiceBadge.tone} 08%, transparent)` }}>{v.voiceBadge.text}</span>
        </div>
        <div style={css(`font:400 26px ${M};font-variant-numeric:tabular-nums;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)`)}><Clock /></div>
      </div>
      <div style={css("flex:1;display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:center;margin-top:10px;overflow-y:auto")}>
        <div style={css(`width:230px;flex:none;display:flex;flex-direction:column;gap:15px;font:400 10.5px ${M};letter-spacing:.14em`)}>
          <RailRow label="MIC" value={dict.supported ? (dict.on ? 'LISTENING' : 'READY') : 'NOT AVAILABLE'} tone={dict.on ? 'var(--nv-cy)' : undefined} barPct={dict.on ? 92 : dict.supported ? 12 : 0} />
          <RailRow label="ANSWERS" value={!v.voiceLive ? 'OFFLINE' : v.voiceBusy ? 'THINKING…' : 'VAULT · READ-ONLY'} tone={v.voiceBusy ? 'var(--nv-cy)' : undefined} barPct={v.voiceBusy ? 88 : v.voiceLive ? 46 : 0} />
          <RailRow label="SPEECH ENGINE" value={v.voiceEngineLabel} tone={v.voiceEngineLabel === 'ELEVENLABS' ? 'var(--nv-cy)' : undefined} barPct={v.voiceSpeaking ? 92 : v.speakOn ? 34 : 0} />
          {v.voiceEngineDetail && (
            <div style={css("font-size:9px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 38%, transparent);letter-spacing:.06em")}>{v.voiceEngineDetail}</div>
          )}
          <div style={css("margin-top:6px;border:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);border-radius:10px;padding:12px 14px;background:var(--nv-well);display:flex;flex-direction:column;gap:10px")}>
            <div style={css("display:flex;justify-content:space-between;align-items:center")}>
              <span style={css("font-size:9px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);letter-spacing:.2em")}>SPEAK REPLIES</span>
              <Interactive as="span" onClick={v.toggleSpeak}
                base={{ cursor: 'pointer', font: `600 9px ${M}`, letterSpacing: '.1em', padding: '4px 10px', borderRadius: '6px', border: v.speakOn ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: v.speakOn ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: v.speakOn ? 'var(--nv-acc-bg)' : 'transparent' }}
              >{v.speakOn ? 'ON' : 'OFF'}</Interactive>
            </div>
            {v.voiceOptions.length > 0 && (
              <div>
                <div style={css("font-size:9px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);letter-spacing:.2em")}>ELEVENLABS VOICE</div>
                <select value={v.voiceVoiceId} onChange={v.setVoiceId}
                  style={{ marginTop: '6px', width: '100%', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: `500 10.5px ${M}`, padding: '6px 8px', outline: 'none' }}>
                  <option value="" style={{ background: '#141019' }}>Account default</option>
                  {v.voiceOptions.map((o) => <option key={o.id} value={o.id} style={{ background: '#141019' }}>{o.name}</option>)}
                </select>
              </div>
            )}
            {v.usingBrowserVoice && v.systemVoices.length > 0 && (
              <div>
                <div style={css("font-size:9px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);letter-spacing:.2em")}>VOICE · FREE ON-DEVICE</div>
                <select value={v.speechVoiceURI} onChange={v.setSpeechVoice}
                  style={{ marginTop: '6px', width: '100%', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: `500 10.5px ${M}`, padding: '6px 8px', outline: 'none' }}>
                  <option value="" style={{ background: '#141019' }}>System default</option>
                  {v.systemVoices.map((o) => <option key={o.uri} value={o.uri} style={{ background: '#141019' }}>{o.name}</option>)}
                </select>
                <div style={css("margin-top:5px;font-size:8.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);letter-spacing:.04em")}>More free voices: iOS Settings → Accessibility → Spoken Content → Voices → download, then they appear here.</div>
              </div>
            )}
          </div>
        </div>
        <div style={css("flex:1;min-width:320px;display:flex;flex-direction:column;align-items:center;gap:20px")}>
          <div style={css("position:relative;width:300px;height:300px;display:flex;align-items:center;justify-content:center;box-shadow:var(--nv-glow-core);border-radius:50%")}>
            <div style={css("position:absolute;inset:0;border-radius:50%;border:1px dashed color-mix(in srgb, var(--nv-cy) 22%, transparent);animation:ringSpin 44s linear infinite var(--nv-anim)")}></div>
            <div style={{ position: 'absolute', inset: '24px', borderRadius: '50%', border: '1px solid color-mix(in srgb, var(--nv-cy) 28%, transparent)', borderTopColor: 'color-mix(in srgb, var(--nv-cy) 85%, transparent)', animation: `ringSpin ${v.voiceBusy ? 3 : 14}s linear infinite reverse var(--nv-anim)` }}></div>
            <NovaCore size={252} engine={v.coreStyle} />
          </div>
          <div style={css(`font:400 10px ${M};letter-spacing:.42em;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)`)}>{caption}</div>
          {(dict.on || v.voiceSpeaking) && (
            <div style={css("display:flex;gap:3px;align-items:center;height:26px")}>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 80%, transparent);animation:wave 1.1s ease-in-out infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 60%, transparent);animation:wave 1.1s ease-in-out .12s infinite")}></span>
              <span style={css("width:3px;height:22px;background:var(--nv-cy);animation:wave 1.1s ease-in-out .24s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 90%, transparent);animation:wave 1.1s ease-in-out .36s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 50%, transparent);animation:wave 1.1s ease-in-out .48s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 75%, transparent);animation:wave 1.1s ease-in-out .6s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 55%, transparent);animation:wave 1.1s ease-in-out .72s infinite")}></span>
            </div>
          )}
          <div style={css("display:flex;gap:10px")}>
            {dict.supported && (
              <Interactive as="span" onClick={() => { v.primeSpeech(); dict.toggle(); }}
                base={{ cursor: 'pointer', font: `500 10.5px ${M}`, padding: '9px 16px', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', color: dict.on ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', background: dict.on ? 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' : 'rgba(0,0,0,.25)' }}
                hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 60%, transparent)"
              >{dict.on ? '● LISTENING — PAUSE SENDS' : '🎙 ASK BY VOICE'}</Interactive>
            )}
            <Interactive as="span" onClick={v.briefMe} base={`cursor:pointer;font:500 10.5px ${M};padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)`} hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">☰ BRIEF ME</Interactive>
          </div>
        </div>
        <div style={css("flex:1 1 340px;min-width:300px;max-width:470px;min-height:360px;max-height:560px;border-left:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-left:24px;display:flex;flex-direction:column")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
            <span style={css(`font:500 10px ${M};letter-spacing:.28em;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)`)}>{v.voiceContinuing ? 'CONVERSATION · CONTINUES ACROSS DAYS' : 'TRANSCRIPT'}</span>
            {v.voiceContinuing && (
              <Interactive as="span" onClick={v.newVoiceChat} base={`cursor:pointer;font:500 9px ${M};letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`} hoverStyle="color:var(--nv-cy)">NEW CHAT</Interactive>
            )}
          </div>
          <div style={css(`flex:1;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 ${M}`)}>
            {v.orbMsgs.length === 0 && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>Ask about anything in your vault — training, fuel, notes, the week. Answers come from what's actually written.</div>
            )}
            {v.orbMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .4s ease-out")}>
                <span style={m.tagStyle}>{m.tag}</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}>{m.text}</span>{m.typing && <span style={css("color:var(--nv-cy)")}>▍</span>}
                {m.remember && (
                  <Interactive as="span" onClick={m.remember} title="File this into the vault via the Inbox"
                    base={`cursor:pointer;display:inline-block;margin-left:8px;font:500 8px ${M};letter-spacing:.1em;padding:1px 7px;border-radius:5px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold)`}
                    hoverStyle="background:color-mix(in srgb, var(--nv-gold) 08%, transparent)"
                  >REMEMBER</Interactive>
                )}
              </div>
            ))}
            {v.voiceBusy && (
              <div style={css("color:var(--nv-cy)")}>» NOVA <span style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>reading the vault…</span><span style={css("color:var(--nv-cy)")}>▍</span></div>
            )}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            <Interactive
              as="input"
              value={v.orbInput}
              onChange={v.setOrbInput}
              onKeyDown={v.orbKey}
              placeholder="Speak or type to Nova…"
              base={`flex:1;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font:400 12.5px ${M};outline:none`}
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.sendOrb} base={`cursor:pointer;display:flex;align-items:center;font:500 11px ${M};padding:0 16px;border-radius:9px;background:var(--nv-cy);color:var(--nv-on-acc)`} hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">SEND</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
