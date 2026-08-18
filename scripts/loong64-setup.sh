#!/usr/bin/env bash
# loong64 platform packages bootstrap for DSH Desktop.
# Downloads the loong64 Node.js runtime, ripgrep binary, and builds
# landlock-run, then lays them out where package.json's file: deps expect.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKGS="$ROOT/platform-pkgs"
NODE_VERSION="${NODE_VERSION:-v26.7.0}"
RG_VERSION="${RG_VERSION:-14.1.1}"

mkdir -p "$PKGS"

info() { echo "[loong64-setup] $*"; }

if [ "$(uname -m)" != "loongarch64" ]; then
  echo "[loong64-setup] ERROR: this script must run on loongarch64." >&2
  exit 1
fi

# ---- Node.js loong64 (https://github.com/loong64/node) ----
if [ ! -x "$PKGS/node-pkg/bin/node" ]; then
  info "fetching Node.js $NODE_VERSION loong64..."
  curl -fsSL -o "$PKGS/node.tar.xz" \
    "https://github.com/loong64/node/releases/download/${NODE_VERSION}/node-${NODE_VERSION}-linux-loong64.tar.xz"
  mkdir -p "$PKGS/node-pkg"
  tar -xJf "$PKGS/node.tar.xz" -C "$PKGS/node-pkg" --strip-components=1 \
    node-${NODE_VERSION}-linux-loong64/bin/node
  chmod +x "$PKGS/node-pkg/bin/node"
  rm -f "$PKGS/node.tar.xz"
  cat > "$PKGS/node-pkg/package.json" <<EOF
{
  "name": "node",
  "version": "${NODE_VERSION#v}",
  "bin": { "node": "bin/node" },
  "os": ["linux"],
  "cpu": ["loong64"]
}
EOF
fi
info "node: $("$PKGS/node-pkg/bin/node" --version)"

# ---- ripgrep loong64 (darkyzhou/ripgrep-loongarch64-musl) ----
if [ ! -x "$PKGS/ripgrep-loong64/bin/rg" ]; then
  info "fetching ripgrep $RG_VERSION loong64..."
  mkdir -p "$PKGS/ripgrep-loong64/bin"
  curl -fsSL -o "$PKGS/ripgrep-loong64/bin/rg" \
    "https://github.com/darkyzhou/ripgrep-loongarch64-musl/releases/download/${RG_VERSION}/rg"
  chmod +x "$PKGS/ripgrep-loong64/bin/rg"
  cat > "$PKGS/ripgrep-loong64/package.json" <<EOF
{
  "name": "@vscode/ripgrep-linux-loong64",
  "version": "1.18.0",
  "description": "ripgrep binary for linux-loong64. Used by @vscode/ripgrep.",
  "license": "MIT",
  "os": ["linux"],
  "cpu": ["loong64"],
  "files": ["bin/"]
}
EOF
fi
info "rg: $("$PKGS/ripgrep-loong64/bin/rg" --version | head -1)"

# ---- landlock-run (build from source, static) ----
if [ ! -x "$PKGS/landlock-loong64/bin/landlock-run" ]; then
  SRC="$ROOT/node_modules/@deepseek-ai/node-addon-landlock-run/src/main.c"
  if [ ! -f "$SRC" ]; then
    echo "[loong64-setup] ERROR: $SRC not found; run 'npm install' first." >&2
    exit 1
  fi
  info "building landlock-run (static)..."
  mkdir -p "$PKGS/landlock-loong64/bin"
  gcc -O2 -static -std=c11 -o "$PKGS/landlock-loong64/bin/landlock-run" "$SRC"
  cat > "$PKGS/landlock-loong64/package.json" <<EOF
{
  "name": "@deepseek-ai/node-addon-landlock-run-linux-loong64",
  "version": "0.1.1",
  "license": "Apache-2.0",
  "os": ["linux"],
  "cpu": ["loong64"],
  "files": ["bin/"]
}
EOF
fi
info "landlock-run: built ($(file -b "$PKGS/landlock-loong64/bin/landlock-run" | cut -d, -f1-2))"

info "done. platform packages ready under platform-pkgs/"
