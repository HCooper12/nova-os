#!/bin/bash
# Builds Nova's Apple on-device model helper (main.swift) into
# server/bin/nova-apple-llm, which lib/localModel.js runs as its `apple`
# backend. Run once, and again after main.swift changes (idempotent):
#   bash server/apple-llm/build.sh
# Needs macOS 26+ with Apple Intelligence on, and Swift from Xcode or the
# Command Line Tools. The binary is gitignored (server/bin/); the source is
# the record. A single swiftc call rather than a Package.swift: one file, no
# dependencies, and SwiftPM's .build folder would be one more thing to ignore.
set -euo pipefail
cd "$(dirname "$0")"

command -v swiftc >/dev/null || { echo "swiftc missing: xcode-select --install"; exit 1; }
mkdir -p ../bin
swiftc -O -parse-as-library main.swift -o ../bin/nova-apple-llm

# prove it: the framework answers and the model is available on this Mac
../bin/nova-apple-llm --health || { echo "built, but Apple's model is not available here (see the line above)"; exit 1; }
echo "setup: built server/bin/nova-apple-llm; set NOVA_LOCAL_LLM_BACKEND=apple to pin it, or leave it as the stand-in when Ollama has no room"
