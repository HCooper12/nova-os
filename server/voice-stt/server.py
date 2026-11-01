"""Nova's local ears: whisper-large-v3-turbo on MLX, held warm in one process.

Groq's Whisper over the internet has been Nova's ears since 25 Sep 2026. His
instruction of 2 Nov 2026 is that Nova works with no internet and no Claude,
and his 19 Oct yes was to a local transcriber MEASURED against Groq on his
real recordings before it becomes the default. This is that transcriber.

The node server owns the lifecycle (server/lib/sttLocal.js spawns it on the
first need, the same way lib/ttsLocal.js spawns Kokoro) and talks to it over
localhost HTTP, the same idiom as server/voice/sidecar.py, so the two engines
read alike. Never exposed beyond 127.0.0.1: auth lives in the node layer.

  GET  /health      -> {ok, model, loadSeconds, memory}
  POST /transcribe  raw audio bytes, ?ext=m4a&language=en&prompt=...
                    or JSON {"path": "/abs/file.ogg", "language", "prompt"}
                    -> {text, seconds, language}

The audio is written to a temp file only for as long as ffmpeg needs to
decode it, and nothing it hears is logged: his words stay in the reply.
"""

import json
import os
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

# mlx-whisper decodes every file through ffmpeg; launchd's PATH has no brew.
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")

import mlx.core as mx  # noqa: E402
import mlx_whisper  # noqa: E402
import numpy as np  # noqa: E402

MODEL = os.environ.get("NOVA_STT_MODEL", "mlx-community/whisper-large-v3-turbo")
# NO NETWORK AT BOOT. Handed a repo id, mlx-whisper asks the Hugging Face hub
# for the file list before it reads the cache (setup.sh printed "Fetching 4
# files"). The whole point of these ears is the Mac with no internet, so a
# cached model is loaded from its local snapshot path and the hub is never
# asked. Only a model that is not cached yet goes to the network.
try:
    from huggingface_hub import snapshot_download
    MODEL_PATH = snapshot_download(MODEL, local_files_only=True)
except Exception:  # noqa: BLE001, not cached: let mlx-whisper fetch it
    MODEL_PATH = MODEL
PORT = int(os.environ.get("NOVA_STT_PORT", "4177"))

# MEMORY (2 Nov 2026), the lesson Kokoro paid for on 21 Oct: MLX keeps every
# GPU buffer it has used and, with no limit, never gives one back; the voice
# engines once held 16 GB of this 16 GB Mac until it froze. Capped here, and
# emptied after every transcription.
mx.set_cache_limit(int(os.environ.get("NOVA_STT_CACHE_MB", "256")) * 1024 * 1024)

# IDLE, THEN GONE. The model is ~1.6 GB resident. An ears engine nobody has
# used for a while gives that back to his Claude sessions and Chrome; the
# next turn pays one load (a few seconds) and node respawns it. 0 = never.
IDLE_MIN = float(os.environ.get("NOVA_STT_IDLE_MIN", "20"))
_last_used = time.time()
_busy = False


def _watchers():
    """Exit when the server that started us is gone, or after IDLE_MIN unused."""
    parent = os.getppid()

    def watch():
        while True:
            time.sleep(5)
            if os.getppid() != parent:
                print("stt: the server that started me is gone, so I stop", flush=True)
                os._exit(0)
            if IDLE_MIN > 0 and not _busy and time.time() - _last_used > IDLE_MIN * 60:
                print(f"stt: idle {IDLE_MIN:g} min, giving the memory back", flush=True)
                os._exit(0)
    threading.Thread(target=watch, daemon=True).start()


_watchers()

print(f"stt: loading {MODEL}…", flush=True)
_t = time.time()
# mlx-whisper loads lazily and caches the model for the process: one second
# of silence loads it AND runs the whole decode path, so the first real turn
# pays no load and no first-run compile.
mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=MODEL_PATH, language="en")
mx.clear_cache()
LOAD_SECONDS = round(time.time() - _t, 2)
print(f"stt: ready on 127.0.0.1:{PORT} ({MODEL}, loaded in {LOAD_SECONDS}s)", flush=True)


def transcribe(path, language, prompt):
    global _busy, _last_used
    _busy = True
    t = time.time()
    try:
        out = mlx_whisper.transcribe(
            path,
            path_or_hf_repo=MODEL_PATH,
            language=language or None,
            initial_prompt=prompt or None,
            # a short spoken turn has no "previous text" worth conditioning
            # on, and conditioning is how Whisper loops a phrase into silence
            condition_on_previous_text=False,
        )
    finally:
        mx.clear_cache()
        _busy = False
        _last_used = time.time()
    return {
        "text": " ".join(str(out.get("text") or "").split()),
        "seconds": round(time.time() - t, 3),
        "language": out.get("language") or language or "",
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet: node writes the receipts
        pass

    def _json(self, code, obj):
        try:
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the caller gave up mid-reply; nothing to answer

    def do_GET(self):
        if self.path == "/health":
            mb = lambda b: round(b / 1048576)  # noqa: E731
            return self._json(200, {"ok": True, "model": MODEL, "loadSeconds": LOAD_SECONDS,
                                    "memory": {"activeMb": mb(mx.get_active_memory()), "cacheMb": mb(mx.get_cache_memory()), "peakMb": mb(mx.get_peak_memory())}})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/transcribe":
            return self._json(404, {"error": "not found"})
        tmp = None
        try:
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if (self.headers.get("Content-Type") or "").startswith("application/json"):
                body = json.loads(raw or b"{}")
                path = body.get("path") or ""
                if not path or not os.path.isfile(path):
                    return self._json(400, {"error": f"no audio file at {path!r}"})
                language, prompt = body.get("language") or "en", body.get("prompt") or ""
            else:
                if not raw:
                    return self._json(400, {"error": "the recording arrived empty"})
                ext = "".join(c for c in (q.get("ext") or "m4a") if c.isalnum())[:5] or "m4a"
                fd, tmp = tempfile.mkstemp(prefix="nova-stt-", suffix=f".{ext}")
                with os.fdopen(fd, "wb") as f:
                    f.write(raw)
                path, language, prompt = tmp, q.get("language") or "en", q.get("prompt") or ""
            self._json(200, transcribe(path, language, prompt))
        except Exception as e:  # noqa: BLE001, one honest error path
            self._json(500, {"error": f"{type(e).__name__}: {e}"})
        finally:
            if tmp:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass


class Server(HTTPServer):
    # Serial on purpose, like Kokoro's: MLX runs best on the main thread, and
    # one transcription at a time is the truth of this device. A deeper
    # listen backlog than Python's 5 so a burst waits instead of being refused
    # (the 469 sentences Kokoro's backlog dropped on 15 Oct).
    request_queue_size = 32


if __name__ == "__main__":
    try:
        Server(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
