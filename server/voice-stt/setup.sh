#!/bin/bash
# Builds Nova's LOCAL EARS: a venv for server.py (mlx-whisper on this Mac's GPU).
# Run once (idempotent):
#   bash server/voice-stt/setup.sh
#
# Why its OWN venv, apart from server/voice/env (Kokoro's): his 19 Oct yes
# came with that condition. Kokoro's venv is a stack of pins paid for in the
# Aug 2026 voice sessions (setuptools<81, misaki, a brew espeak-ng), and
# mlx-whisper drags its own numba/torch-free numpy + tiktoken set. Sharing one
# venv means an upgrade for the ears can silence the voice. Two venvs, two
# setup scripts, and neither can break the other. (25 Sep: Whisper through
# mlx_audio in Kokoro's venv failed with "Processor not found"; mlx-whisper is
# the package the prompt pack names and the one that runs the cached model.)
#
# Pinned to an exact version: an ears that changes under him between reloads
# is the opposite of the measurement shadow mode exists for.
#   - uv venv + invoking env/bin/python DIRECTLY (venv shebangs break on the
#     space in this repo's path, same as Kokoro's)
#   - ffmpeg from brew: mlx-whisper decodes every file through it
set -euo pipefail
cd "$(dirname "$0")"

MLX_WHISPER_VERSION="0.4.3"   # 29 Aug 2025 release
MODEL="mlx-community/whisper-large-v3-turbo"

command -v uv >/dev/null || { echo "uv missing: brew install uv"; exit 1; }
command -v /opt/homebrew/bin/ffmpeg >/dev/null || { echo "ffmpeg missing: brew install ffmpeg"; exit 1; }

[ -d env ] || uv venv --python 3.12 env
uv pip install --python env/bin/python "mlx-whisper==${MLX_WHISPER_VERSION}"

# Fetch the model if it is not cached already (it usually is: ~1.5 GB under
# ~/.cache/huggingface/hub), then prove the whole path turns audio into a
# result. One second of silence is enough to load and run the model; it is
# the same warm pass server.py makes at boot.
PATH="/opt/homebrew/bin:$PATH" NOVA_STT_MODEL="$MODEL" env/bin/python - <<'PY'
import os, time
import numpy as np
import mlx_whisper
t = time.time()
out = mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=os.environ["NOVA_STT_MODEL"], language="en")
assert isinstance(out, dict) and "text" in out, "mlx-whisper returned no result"
print(f"setup: {os.environ['NOVA_STT_MODEL']} loaded and ran in {time.time() - t:.1f}s")
PY
echo "setup: done. The ears are now 'configured'; Nova boots them on demand (server/lib/sttLocal.js)."
