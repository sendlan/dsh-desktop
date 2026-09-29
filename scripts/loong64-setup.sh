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
  echo "[loong64-setup] SKIP: not loongarch64 (this repo targets LoongArch64)." >&2
  exit 0
fi

# ---- Node.js loong64 (https://github.com/loong64/node) ----
if [ ! -x "$PKGS/node-pkg/bin/node" ]; then
  info "fetching Node.js $NODE_VERSION loong64..."
  curl -fsSL -o "$PKGS/node.tar.xz" \
    "https://github.com/loong64/node/releases/download/${NODE_VERSION}/node-${NODE_VERSION}-linux-loong64.tar.xz"
  mkdir -p "$PKGS/node-pkg"
  tar -xJf "$PKGS/node.tar.xz" -C "$PKGS/node-pkg" --strip-components=1 \
    node-${NODE_VERSION}-linux-loong64
  chmod +x "$PKGS/node-pkg/bin/node"
  rm -f "$PKGS/node.tar.xz"
else
  info "node binary already present; skipping download"
fi
cat > "$PKGS/node-pkg/package.json" <<EOF
{
  "name": "node",
  "version": "${NODE_VERSION#v}",
  "bin": { "node": "bin/node" },
  "os": ["linux"],
  "cpu": ["loong64"]
}
EOF
info "node: $("$PKGS/node-pkg/bin/node" --version)"

# ---- ripgrep loong64 (darkyzhou/ripgrep-loongarch64-musl) ----
if [ ! -x "$PKGS/ripgrep-loong64/bin/rg" ]; then
  info "fetching ripgrep $RG_VERSION loong64..."
  mkdir -p "$PKGS/ripgrep-loong64/bin"
  curl -fsSL -o "$PKGS/ripgrep-loong64/bin/rg" \
    "https://github.com/darkyzhou/ripgrep-loongarch64-musl/releases/download/${RG_VERSION}/rg"
  chmod +x "$PKGS/ripgrep-loong64/bin/rg"
else
  info "ripgrep binary already present; skipping download"
fi
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
info "rg: $("$PKGS/ripgrep-loong64/bin/rg" --version | head -1)"

# ---- landlock-run (build from vendored source, static) ----
if [ ! -x "$PKGS/landlock-loong64/bin/landlock-run" ]; then
  SRC="$ROOT/scripts/vendor/landlock-main.c"
  if [ ! -f "$SRC" ]; then
    echo "[loong64-setup] ERROR: $SRC not found." >&2
    exit 1
  fi
  if ! command -v gcc >/dev/null 2>&1; then
    echo "[loong64-setup] ERROR: gcc is required to build landlock-run." >&2
    exit 1
  fi
  info "building landlock-run (static)..."
  mkdir -p "$PKGS/landlock-loong64/bin"
  gcc -O2 -static -std=c11 -o "$PKGS/landlock-loong64/bin/landlock-run" "$SRC"
else
  info "landlock-run binary already present; skipping build"
fi
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
info "landlock-run: $(file -b "$PKGS/landlock-loong64/bin/landlock-run" | cut -d, -f1-2)"

# ---- node-addon-system loong64 (Landlock launcher + Node-API flock) ----
# Upstream dsh >= 0.9.0 replaced the standalone @deepseek-ai/node-addon-landlock-run
# with @deepseek-ai/node-addon-system, whose per-arch packages carry BOTH the
# Landlock launcher (bin/landlock-run) and the Node-API flock addon
# (bin/<libc>/system.node). npm publishes no linux-loong64 variant (the umbrella
# package's optionalDependencies list only x64/arm64), so on a loong64 host the
# harness's `require.resolve('@deepseek-ai/node-addon-system-linux-loong64/
# package.json')` fails and every session write dies with "Cannot find module
# ... system.node". Build the flock addon natively here and assemble the package;
# the committed platform-pkgs/system.tgz lets the x86 CI cross-package it (see
# scripts/loong64-package.sh).
SYSTEM_PKG="$PKGS/system-loong64"
SYSTEM_NODE="$SYSTEM_PKG/bin/glibc/system.node"
FLOCK_SRC="$ROOT/node_modules/@deepseek-ai/node-addon-system/src/flock.c"
if [ ! -f "$SYSTEM_NODE" ]; then
  if [ ! -f "$FLOCK_SRC" ]; then
    echo "[loong64-setup] WARN: $FLOCK_SRC not found; flock addon not built" >&2
  else
    HDR="$PKGS/node-pkg/include/node"
    [ -f "$HDR/node_api.h" ] || HDR="$ROOT/node_modules/koffi/vendor/node-api-headers/include"
    if [ ! -f "$HDR/node_api.h" ]; then
      echo "[loong64-setup] ERROR: Node-API headers not found (need $PKGS/node-pkg/include/node/node_api.h)" >&2
      exit 1
    fi
    info "building node-addon-system flock addon (glibc)..."
    mkdir -p "$SYSTEM_PKG/bin/glibc"
    gcc -O2 -fPIC -shared -I"$HDR" -o "$SYSTEM_NODE" "$FLOCK_SRC"
  fi
else
  info "system flock addon already present; skipping build"
fi
if [ -f "$SYSTEM_NODE" ]; then
  mkdir -p "$SYSTEM_PKG/bin"
  cp -f "$PKGS/landlock-loong64/bin/landlock-run" "$SYSTEM_PKG/bin/landlock-run"
  SYS_VER="$("$PKGS/node-pkg/bin/node" -p "require('$ROOT/node_modules/@deepseek-ai/node-addon-system/package.json').version" 2>/dev/null || echo 0.1.2)"
  cat > "$SYSTEM_PKG/package.json" <<EOF
{
  "name": "@deepseek-ai/node-addon-system-linux-loong64",
  "version": "${SYS_VER}",
  "description": "Linux loong64 system binaries: static Landlock launcher and glibc Node-API flock addon",
  "os": ["linux"],
  "cpu": ["loong64"],
  "files": ["README.md", "bin/", "prebuilds.json"],
  "engines": { "node": ">=20" },
  "license": "BSD-3-Clause",
  "publishConfig": { "access": "public" }
}
EOF
  cat > "$SYSTEM_PKG/prebuilds.json" <<EOF
{
  "platform": "linux-loong64",
  "binaries": [
    { "tool": "landlock-run", "kind": "static-musl", "path": "bin/landlock-run" },
    { "tool": "flock", "kind": "node-api", "napi": 8, "libc": "glibc", "path": "bin/glibc/system.node" }
  ]
}
EOF
  info "node-addon-system-linux-loong64 assembled (v$SYS_VER)"
fi

# npm copies file: deps into node_modules before preinstall runs, so the
# binaries land in platform-pkgs after the copy. Sync them into node_modules
# (no-op when npm install has not been run yet).
sync_binaries() {
  local src="$1" dst="$2"
  if [ -d "$dst" ]; then
    mkdir -p "$dst"
    cp -r "$src/." "$dst/"
  fi
}
sync_binaries "$PKGS/node-pkg" "$ROOT/node_modules/node"
sync_binaries "$PKGS/ripgrep-loong64" "$ROOT/node_modules/@vscode/ripgrep-linux-loong64"
sync_binaries "$PKGS/landlock-loong64" "$ROOT/node_modules/@deepseek-ai/node-addon-landlock-run-linux-loong64"
sync_binaries "$PKGS/system-loong64" "$ROOT/node_modules/@deepseek-ai/node-addon-system-linux-loong64"

# ---- native addons (node-pty, koffi) built against the bundled loong64 node ----
NODE_BIN="$PKGS/node-pkg/bin/node"

# node-pty: node-gyp rebuild against the bundled node headers/ABI.
PTY_DIR="$ROOT/node_modules/node-pty"
if [ -d "$PTY_DIR" ] && [ ! -f "$PTY_DIR/build/Release/pty.node" ]; then
  if [ ! -f "$ROOT/node_modules/node-gyp/bin/node-gyp.js" ]; then
    echo "[loong64-setup] ERROR: node-gyp not installed (node_modules/node-gyp missing)." >&2
    exit 1
  fi
  info "building node-pty against node $NODE_VERSION..."
  (cd "$PTY_DIR" && "$NODE_BIN" "$ROOT/node_modules/node-gyp/bin/node-gyp.js" \
    rebuild --nodedir="$PKGS/node-pkg")
else
  info "node-pty native already present; skipping build"
fi

# koffi: build the loong64 native binding (koffi ships loong64_asm.S upstream).
KOFFI_DIR="$ROOT/node_modules/koffi"
if [ -d "$KOFFI_DIR" ] && [ ! -f "$KOFFI_DIR/build/koffi/linux_loong64/koffi.node" ]; then
  info "building koffi for linux_loong64..."
  (cd "$KOFFI_DIR" && "$NODE_BIN" ./cnoke.cjs build -D src/koffi -P . --release)
else
  info "koffi native already present; skipping build"
fi

# ---- propagate the two committed file: deps into npm-installable tarballs ----
# (content root must be "package/" per npm's tarball layout)
pack_tgz() {
  local src="$1" out="$2"
  local tmp
  tmp="$(mktemp -d)"
  cp -a "$src/." "$tmp/package/"
  tar -C "$tmp" -czf "$out" package
  rm -rf "$tmp"
}
pack_tgz "$PKGS/ripgrep-loong64" "$PKGS/rg.tgz"
pack_tgz "$PKGS/landlock-loong64" "$PKGS/landlock.tgz"
pack_tgz "$PKGS/system-loong64" "$PKGS/system.tgz"
info "repacked platform-pkgs/rg.tgz + platform-pkgs/landlock.tgz + platform-pkgs/system.tgz"

info "done. platform packages ready under platform-pkgs/"
