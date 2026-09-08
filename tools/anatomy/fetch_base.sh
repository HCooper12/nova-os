#!/usr/bin/env bash
# Fetch the CC0 human base mesh Nova's anatomy model is built on.
#
# Blender's own "Human Base Meshes" asset bundle — public domain (CC0), from
# blender.org/download/demo-files. Cached outside the repo: it is 50 MB, it
# never changes, and what ships in the app is the exported .glb, not this.
set -euo pipefail
URL="https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip"
DIR="${NOVA_ANATOMY_CACHE:-$HOME/.cache/nova-anatomy}"
BLEND="$DIR/human_base_meshes_bundle.blend"
mkdir -p "$DIR"
if [ -f "$BLEND" ]; then echo "base mesh already cached at $BLEND"; exit 0; fi
echo "fetching the CC0 human base meshes (50 MB)…"
curl -sL --max-time 900 -o "$DIR/hbm.zip" "$URL"
unzip -o -q "$DIR/hbm.zip" -d "$DIR/unzip"
find "$DIR/unzip" -name 'human_base_meshes_bundle.blend' -exec cp {} "$BLEND" \;
rm -rf "$DIR/hbm.zip" "$DIR/unzip"
echo "cached → $BLEND"
