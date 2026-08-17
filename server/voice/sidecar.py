"""Nova's local voice — a persistent Kokoro-82M sidecar on MLX.

Holds the model warm (load is ~0.5s, synthesis 0.6-2.3s measured on this
machine) and serves WAV over localhost HTTP. The node server owns the
lifecycle: it spawns this at boot when NOVA_TTS_LOCAL=1 and talks to it via
lib/ttsLocal.js. Never exposed beyond 127.0.0.1 — auth lives in the node
layer with everything else.

Voices are weighted blends of Kokoro's British male packs, chosen by ear
across five listening rounds (Aug 2026). The pipeline caches voices in a
dict it consults BEFORE loading by name, so blends are injected as first-
class named voices — no model-layer patches.
"""

import io
import json
import os
import sys

# The pip-bundled espeak-ng dylib is broken on this machine (it bakes a CI
# runner's data path into the binary and dies on 'phontab'). Point the loader
# at brew's install BEFORE anything imports misaki, which calls these at
# import time.
ESPEAK_LIB = os.environ.get("NOVA_ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib")
ESPEAK_DATA = os.environ.get("NOVA_ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data")
import espeakng_loader  # noqa: E402

espeakng_loader.get_library_path = lambda: ESPEAK_LIB
espeakng_loader.get_data_path = lambda: ESPEAK_DATA

import mlx.core as mx  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer  # noqa: E402
from mlx_audio.tts.models.kokoro.pipeline import KokoroPipeline  # noqa: E402
from mlx_audio.tts.utils import load_model  # noqa: E402

REPO = "prince-canuma/Kokoro-82M"
PORT = int(os.environ.get("NOVA_TTS_PORT", "4175"))
SAMPLE_RATE = 24000

# Blend weights picked by ear: 'nova' is round-4 R3 (the smooth pair with
# daniel's depth), 'nova-light' is R6 (same family, lighter on daniel).
BLENDS = {
    "nova": [("bm_fable", 0.35), ("bm_lewis", 0.35), ("bm_daniel", 0.30)],
    "nova-light": [("bm_fable", 0.40), ("bm_lewis", 0.40), ("bm_daniel", 0.20)],
}

print("sidecar: loading model…", flush=True)
model = load_model(REPO)
pipeline = KokoroPipeline(lang_code="b", model=model, repo_id=REPO)
for name, parts in BLENDS.items():
    packs = [pipeline.load_single_voice(v) * w for v, w in parts]
    pipeline.voices[name] = mx.add(*packs) if len(packs) == 2 else sum(packs)
# Warm the whole path once so the first real request pays no lazy init.
for _ in pipeline("Ready.", voice="nova"):
    pass
print(f"sidecar: ready on 127.0.0.1:{PORT} voices={list(BLENDS)}", flush=True)


def synth(text, voice, speed):
    chunks = []
    for result in pipeline(text, voice=voice, speed=speed):
        audio = result.audio
        chunks.append(np.asarray(audio) if not isinstance(audio, np.ndarray) else audio)
    if not chunks:
        raise ValueError("no audio produced")
    wav = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    buf = io.BytesIO()
    sf.write(buf, np.ravel(wav), SAMPLE_RATE, format="WAV")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet — node receipts every request already
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "voices": list(BLENDS)})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/tts":
            return self._json(404, {"error": "not found"})
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            body = json.loads(raw or b"{}")
            text = (body.get("text") or "").strip()
            if not text:
                return self._json(400, {"error": "text is required"})
            voice = body.get("voice") or "nova"
            if voice not in BLENDS and not voice.startswith(("bm_", "bf_", "am_", "af_")):
                return self._json(400, {"error": f"unknown voice {voice!r}"})
            wav = synth(text, voice, float(body.get("speed") or 1.0))
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)
        except Exception as e:  # noqa: BLE001 — one honest error path
            self._json(500, {"error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
