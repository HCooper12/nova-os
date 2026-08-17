#!/bin/bash
# Builds the local-voice venv for sidecar.py. Run once (idempotent):
#   bash server/voice/setup.sh
# Every pinned quirk below was paid for in the Aug 2026 voice sessions:
#   - uv venv + invoking env/bin/python DIRECTLY (venv shebangs break on the
#     space in this repo's path)
#   - setuptools<81 (resemble-perth style pkg_resources users die on 81+;
#     misaki tolerates it but keep the floor consistent)
#   - en_core_web_sm installed explicitly (misaki's G2P needs it and its
#     auto-install path hard-exits with no traceback when it's missing)
#   - espeak-ng from brew (the pip wheel's dylib bakes a CI path into the
#     binary and cannot find 'phontab'); sidecar.py points the loader at it
set -euo pipefail
cd "$(dirname "$0")"

command -v uv >/dev/null || { echo "uv missing: brew install uv"; exit 1; }
[ -f /opt/homebrew/lib/libespeak-ng.dylib ] || { echo "espeak-ng missing: brew install espeak-ng"; exit 1; }
command -v /opt/homebrew/bin/ffmpeg >/dev/null || { echo "ffmpeg missing: brew install ffmpeg"; exit 1; }

[ -d env ] || uv venv --python 3.12 env
uv pip install --python env/bin/python \
  mlx-audio soundfile "setuptools<81" "misaki[en]" espeakng-loader phonemizer-fork \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl

# Prefetch the model + voice packs so the sidecar's first boot needs no
# network, then prove the whole path produces audio.
env/bin/python - <<'EOF'
import os
os.environ.setdefault("NOVA_ESPEAK_LIB", "/opt/homebrew/lib/libespeak-ng.dylib")
os.environ.setdefault("NOVA_ESPEAK_DATA", "/opt/homebrew/share/espeak-ng-data")
import espeakng_loader
espeakng_loader.get_library_path = lambda: os.environ["NOVA_ESPEAK_LIB"]
espeakng_loader.get_data_path = lambda: os.environ["NOVA_ESPEAK_DATA"]
import numpy as np
from mlx_audio.tts.models.kokoro.pipeline import KokoroPipeline
from mlx_audio.tts.utils import load_model

model = load_model("prince-canuma/Kokoro-82M")
pipe = KokoroPipeline(lang_code="b", model=model, repo_id="prince-canuma/Kokoro-82M")
for v in ["bm_fable", "bm_lewis", "bm_daniel"]:
    pipe.load_single_voice(v)
audio = [np.asarray(r.audio) for r in pipe("Setup verified.", voice="bm_fable")]
assert audio and audio[0].size > 1000, "synthesis produced no audio"
print("setup: model + voices cached, synthesis verified")
EOF
echo "setup: done — set NOVA_TTS_LOCAL=1 in server/.env and restart the service"
