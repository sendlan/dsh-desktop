#!/usr/bin/env bash
# loong64 packaging for DSH Desktop.
#
# This file lives ONLY on the loong64 branch; upstream (main) does not have it,
# so it never conflicts with upstream merges and never pollutes package.json or
# the shared devDependencies. Consequently it intentionally does NOT rely on any
# loong64-specific script/target in package.json — it is fully self-contained:
#
#   1. Ensures the loong64 electron runtime is unpacked (checksum-injected cache
#      + unzip, no network when cached).
#   2. Builds the app with electron-vite.
#   3. Packages a .deb for loong64 with the loong64 electron-builder port
#      (@loongdotjs/electron-builder), which official electron-builder lacks
#      (official has no --loong64 arch).
#
# Usage:
#   scripts/loong64-package.sh [repo_dir] [version]
#
# Output naming (kept in sync with the publishing version):
#   dist/dsh-desktop-<version>-loong64.deb
#   version defaults to the release tag/env BUILD_VERSION if set, otherwise the
#   package.json "version". Pass the upstream release tag (e.g. v0.7.1) so the
#   published asset name matches the GitHub release.
#
# Version field:
#   The deb's internal Version: (what apt/dpkg use for install/upgrade) is also
#   baked from <version> (tag minus 'v'), because upstream keeps package.json at
#   an unchanging 0.1.1. Without this every published deb reports the same wrong
#   version and package managers refuse to install/upgrade the loong64 builds.
#
# Architecture scope:
#   This scripts ONLY produces the "new world" (新世界, ABI2.0) package named
#   `loong64`. It intentionally does NOT produce the "old world" (旧世界, ABI1.0)
#   `loongarch64` package. On Debian-family: 新世界=loong64 (ABI2.0);
#   旧世界=loongarch64 (ABI1.0). We ship only loong64/ABI2.0.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ $# -ge 1 ]; then
  ROOT="$(cd "$1" && pwd)"
fi
# Prefer the loong64 node runtime if present (native loongarch64 host, set up by
# scripts/loong64-setup.sh). Otherwise fall back to a plain `node` from PATH --
# all loong64 packaging steps (checksum injection, electron-vite build, and the
# pure-JS @loongdotjs/electron-builder) are architecture-independent Node.js
# operations, so a stock Node (e.g. actions/setup-node on an x86 CI runner) can
# build an Architecture=loong64 .deb without ever executing the loong64 binaries
# (deb packaging only archives the prebuilt files + sets the Architecture field).
LOONG64_NODE="$ROOT/platform-pkgs/node-pkg/bin"
if [ -x "$LOONG64_NODE/node" ]; then
  export PATH="$LOONG64_NODE:$PATH"
else
  LOONG64_NODE=""
  echo "[loong64-package] no loong64 node runtime (${LOONG64_NODE:-platform-pkgs}); using system node: $(command -v node || echo MISSING)"
fi
command -v node >/dev/null 2>&1 || { echo "[loong64-package] ERROR: no node on PATH" >&2; exit 2; }

# --- electron loong64 runtime ------------------------------------------------
# The loong64 electron binary is community-ported (darkyzhou/electron-loong64).
# We pin to the latest available loong64 version and mirror its release assets in
# case the official electron@<version> has no loong64 build. electron's bundled
# checksums.json has no loong64 entry (loong64 is not an official arch), which
# would fail @electron/get cache validation and force a network re-download; we
# inject the known-good sha256 so the local 128MB cache is reused.
ELECTRON_LOONG64_VERSION="${ELECTRON_LOONG64_VERSION:-42.3.0}"
ELECTRON_MIRROR="https://github.com/darkyzhou/electron-loong64/releases/download/"
export ELECTRON_MIRROR
ELECTRON_LOONG64_SHA="92b0ca0c9c18ed90166918a4ac1970266c4fa967aee9277031b3b250b905526e"

ELECTRON_DIR="$ROOT/node_modules/electron"
ELECTRON_DIST="$ELECTRON_DIR/dist"
ELECTRON_BIN="$ELECTRON_DIST/electron"
ELECTRON_ZIP="electron-v${ELECTRON_LOONG64_VERSION}-linux-loong64.zip"

ensure_electron() {
  # Keep the checksum present so @electron/get validates cache hits.
  local checksum_file="$ELECTRON_DIR/checksums.json"
  if [ -f "$checksum_file" ]; then
    node -e "
      const fs = require('fs');
      const p = process.argv[1], sha = process.argv[2], asset = process.argv[3];
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!c[asset]) { c[asset] = sha; fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n'); console.log('[loong64-package] injected loong64 checksum for', asset); }
    " "$checksum_file" "$ELECTRON_LOONG64_SHA" "$ELECTRON_ZIP"
  fi

  if [ ! -x "$ELECTRON_BIN" ] || [ ! -f "$ELECTRON_DIST/version" ]; then
    # Find the pinned loong64 zip: first reuse @electron/get's cache (native host
    # already has it), otherwise download it directly. We do NOT rely on
    # electron's install.js to fetch it: on a non-loong64 host install.js would
    # resolve the platform arch (x64) and the electron package's own version
    # (43.4.0) instead of OUR pinned loong64 42.3.0, hitting a 404. We always
    # download the exact electron-v42.3.0-linux-loong64.zip and verify its sha.
    local cache_root="$HOME/.cache/loong64-electron"
    local cached
    cached="$(ls "$HOME"/.cache/electron/*/"$ELECTRON_ZIP" 2>/dev/null | head -1 || true)"
    if [ -z "$cached" ] || [ ! -s "$cached" ]; then
      mkdir -p "$cache_root"
      local dl_url="${ELECTRON_MIRROR}v${ELECTRON_LOONG64_VERSION}/${ELECTRON_ZIP}"
      if [ -s "$cache_root/$ELECTRON_ZIP" ]; then
        cached="$cache_root/$ELECTRON_ZIP"
        echo "[loong64-package] reusing script cache: $cached"
      else
        echo "[loong64-package] downloading $dl_url"
        curl -fL --retry 3 --retry-all-errors --connect-timeout 30 -o "$cache_root/$ELECTRON_ZIP" "$dl_url"
        echo "$ELECTRON_LOONG64_SHA  $cache_root/$ELECTRON_ZIP" | sha256sum -c - \
          || { echo "[loong64-package] ERROR: sha256 mismatch for $ELECTRON_ZIP" >&2; exit 6; }
        cached="$cache_root/$ELECTRON_ZIP"
      fi
    fi
    if [ -n "$cached" ] && [ -s "$cached" ]; then
      echo "[loong64-package] unpacking electron loong64 zip into dist ($cached)"
      rm -rf "$ELECTRON_DIST"
      mkdir -p "$ELECTRON_DIST"
      unzip -o -q "$cached" -d "$ELECTRON_DIST"
      printf '%s' "electron" > "$ELECTRON_DIR/path.txt"
    else
      echo "[loong64-package] ERROR: electron loong64 zip unavailable: $cached" >&2
      exit 6
    fi
  fi
  [ -x "$ELECTRON_BIN" ] || { echo "[loong64-package] ERROR: electron loong64 runtime missing" >&2; exit 6; }
  echo "[loong64-package] electron loong64 ready: $("$ELECTRON_BIN" --version 2>/dev/null || echo present)"
}

# --- loong64 electron-builder -------------------------------------------------
# Official electron-builder has no --loong64 arch; the loong64 port is installed
# into an isolated directory (kept OUT of package.json so it does not affect
# upstream installs / merges). This is a self-contained fallback: prefer an
# existing system-wide install, otherwise provision it during the build.
LOONG64_EB=""
ensure_builder() {
  # 1) explicit env override
  if [ -n "${LOONG64_EBUILDER:-}" ] && [ -x "$LOONG64_EBUILDER/cli.js" ]; then
    LOONG64_EB="$LOONG64_EBUILDER/cli.js"; return
  fi
  # 2) existing system install (set up once via scripts/loong64-setup.sh)
  if [ -x "$HOME/.local/lib/loongdotjs-ebuilder/node_modules/.bin/electron-builder" ]; then
    LOONG64_EB="$HOME/.local/lib/loongdotjs-ebuilder/node_modules/@loongdotjs/electron-builder/cli.js"; return
  fi
  # 3) provision an isolated toolchain OUTSIDE $ROOT/node_modules (so npm does not
  #    hoist deps up into the project's already-populated node_modules). We wipe
  #    and rebuild the dir each time so a leftover can never make npm report
  #    "up to date" without actually installing. --prefix pins the location and
  #    sidesteps npm walking up the tree to a stray package.json (e.g. $HOME).
  local eb_dir="$HOME/.cache/loong64-ebuilder"
  rm -rf "$eb_dir"
  echo "[loong64-package] provisioning @loongdotjs/electron-builder@26.15.6 (isolated: $eb_dir)..."
  npm install --prefix "$eb_dir" --no-save @loongdotjs/electron-builder@26.15.6 \
        --no-audit --no-fund --registry=https://registry.npmjs.org/
  local local_eb="$eb_dir/node_modules/@loongdotjs/electron-builder/cli.js"
  # npm hoisting can vary; accept whichever path actually holds cli.js.
  for cand in "$local_eb" "$ROOT/node_modules/@loongdotjs/electron-builder/cli.js"; do
    if [ -x "$cand" ]; then
      LOONG64_EB="$(readlink -f "$cand" 2>/dev/null || echo "$cand")"
      break
    fi
  done
  [ -x "$LOONG64_EB" ] || { echo "[loong64-package] ERROR: @loongdotjs/electron-builder missing after provisioning ($LOONG64_EB)" >&2; exit 6; }
}

# Restore package.json "version" after a build-time bake. Args: $1=package.json
# path, $2=original version. Safe to call even if no bake happened (no-op when
# the file is gone). Never lets a transient bake leak into the working tree.
restore_pkg_version() {
  local p="$1" v="$2"
  [ -f "$p" ] || return 0
  node -e "const fs=require('fs');const p=process.argv[1],v=process.argv[2];let j;try{j=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){process.exit(0)}j.version=v;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')" "$p" "$v" || true
}

main() {
  echo "== DSH Desktop loong64 package: $(date -Is) =="  echo "repo=$ROOT node=$(node --version)"
  ensure_electron
  ensure_builder

  # Version used for the release-synced artifact name: <version> arg > $BUILD_VERSION
  # env > package.json "version".
  local version="$2"
  if [ -z "$version" ]; then
    version="${BUILD_VERSION:-}"
  fi
  if [ -z "$version" ]; then
    version="$(node -e "console.log(require('$ROOT/package.json').version)")"
  fi
  echo "[loong64-package] artifact version: $version"

  # The .deb's internal Version: (what apt/dpkg actually use for install/upgrade)
  # comes from package.json "version", which upstream keeps pinned at 0.1.1 and
  # never bumps per release. That makes every published deb report the same wrong
  # version, so package managers refuse to upgrade our builds. When an explicit
  # release version is given, temporarily override package.json "version" (minus
  # the 'v' prefix, since Debian version numbers must start with a digit) for the
  # electron-builder step and restore it afterwards.
  local pkg_json="$ROOT/package.json"
  local baked_version="$(node -e "console.log(require('$pkg_json').version)")"
  local deb_version="${version#v}"
  if [ "$deb_version" != "$baked_version" ]; then
    echo "[loong64-package] baking deb version: $baked_version -> $deb_version"
    node -e "const fs=require('fs');const p=process.argv[1],v=process.argv[2];const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version=v;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')" "$pkg_json" "$deb_version"
    trap "restore_pkg_version '$pkg_json' '$baked_version'" EXIT
  fi

  echo "[loong64-package] building renderer/main with electron-vite"
  ( cd "$ROOT" && npm run build )

  echo "[loong64-package] packaging .deb for loong64"
  ( cd "$ROOT" && node "$LOONG64_EB" --linux deb --loong64 --publish never \
      -c.electronDist="$ELECTRON_DIST" \
      -c.linux.icon=build/app-icon.png \
      -c.linux.maintainer="sendlan <sendlan@outlook.com>" \
      -c.linux.category=Utility )

  local src="$ROOT/dist/dsh-desktop-linux-loong64.deb"
  [ -f "$src" ] || { echo "[loong64-package] ERROR: expected artifact missing: $src" >&2; exit 6; }
  if ! dpkg-deb -f "$src" Architecture | grep -qx 'loong64'; then
    echo "[loong64-package] ERROR: artifact is not loong64 architecture: $src" >&2
    exit 6
  fi

  # Rename to the release-synced convention: dsh-desktop-<version>-loong64.deb
  local out="$ROOT/dist/dsh-desktop-${version}-loong64.deb"
  if [ "$src" != "$out" ]; then
    mv -f "$src" "$out"
  fi
  echo "[loong64-package] SUCCESS: $out"
}

main "$@"
