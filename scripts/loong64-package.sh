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

# loong64 node runtime bundled into the app (node_modules/node/bin/node). The
# harness spawns this node, so the shipped .deb must contain the real loong64
# binary -- not the registry `node` package stub. Downloading the official
# loong64/node build is architecture-independent, so an x86 CI runner can place
# it alongside a loong64 host. EM_LOONGARCH = 258 (183 is aarch64, not loong64).
NODE_LOONG64_VERSION="${NODE_LOONG64_VERSION:-v26.7.0}"
NODE_LOONG64_URL_BASE="https://github.com/loong64/node/releases/download/${NODE_LOONG64_VERSION}"
NODE_LOONG64_EM=258

bootstrap_native_assets() {
  local node_bin="$ROOT/node_modules/node/bin/node"

  # 1) loong64 node binary for the harness child process.
  local node_is_ok=0
  if [ -x "$node_bin" ]; then
    local em="$(node -e '
      const fs = require("fs");
      try {
        const p = process.argv[1];
        const fd = fs.openSync(p, "r");
        const b = Buffer.alloc(20);
        fs.readSync(fd, b, 0, 20, 0);
        fs.closeSync(fd);
        if (b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) { process.stdout.write("0"); process.exit(0); }
        process.stdout.write((b[18] | (b[19] << 8)) === 258 ? "1" : "0");
      } catch (e) { process.stdout.write("0"); }
    ' "$node_bin" 2>/dev/null)"
    if [ "$em" = "1" ]; then
      local ver="$( "$node_bin" --version 2>/dev/null || true )"
      [ "$ver" = "$NODE_LOONG64_VERSION" ] && node_is_ok=1
    fi
  fi
  if [ "$node_is_ok" -ne 1 ]; then
    echo "[loong64-package] bootstrapping loong64 node $NODE_LOONG64_VERSION..."
    local tmp="$ROOT/platform-pkgs/node-${NODE_LOONG64_VERSION}-linux-loong64.tar.xz"
    mkdir -p "$ROOT/platform-pkgs"
    curl -fL --retry 3 --retry-all-errors --connect-timeout 30 \
      -o "$tmp" "${NODE_LOONG64_URL_BASE}/node-${NODE_LOONG64_VERSION}-linux-loong64.tar.xz"
    mkdir -p "$(dirname "$node_bin")"
    tar -xJf "$tmp" -C "$(dirname "$node_bin")" --strip-components=2 \
      "node-${NODE_LOONG64_VERSION}-linux-loong64/bin/node"
    rm -f "$tmp"
    chmod +x "$node_bin"
    echo "[loong64-package] bundled node -> loong64 $("$node_bin" --version)"
  fi

  # 2) node-pty native addon. Committed as a vendored artifact because an x86
  #    runner cannot cross-compile it; the source itself still builds it on a
  #    loong64 host via node-gyp (see scripts/loong64-setup.sh).
  local pty_dst="$ROOT/node_modules/node-pty/build/Release/pty.node"
  if [ ! -f "$pty_dst" ]; then
    echo "[loong64-package] placing vendored loong64 pty.node"
    mkdir -p "$(dirname "$pty_dst")"
    cp "$ROOT/scripts/vendor/pty-node-linux-loong64.node" "$pty_dst"
  fi
}

# koffi (used by the app's native FFI layer) ships per-arch natives as
# optionalDependencies. On the x86 CI runner npm installs only koffi-linux-x64
# and silently skips koffi-linux-loong64, which would leave the shipped deb
# unable to load koffi on a loong64 host. The npm registry does publish the
# loong64 variant; fetch it here (architecture-independent) and drop it into
# node_modules before electron-builder packs the tree.
ensure_koffi_loong64() {
  local dest="$ROOT/node_modules/@koromix/koffi-linux-loong64"
  if [ -n "$(find "$dest" -name koffi.node -print -quit 2>/dev/null)" ]; then
    echo "[loong64-package] koffi-linux-loong64 already present"
    return 0
  fi
  local ver url integ
  ver="$(node -p 'const l=require(process.argv[1]),e=l.packages?.["node_modules/@koromix/koffi-linux-loong64"];e?e.version:""' "$ROOT/package-lock.json" 2>/dev/null || true)"
  url="$(node -p 'const l=require(process.argv[1]),e=l.packages?.["node_modules/@koromix/koffi-linux-loong64"];e?e.resolved:""' "$ROOT/package-lock.json" 2>/dev/null || true)"
  integ="$(node -p 'const l=require(process.argv[1]),e=l.packages?.["node_modules/@koromix/koffi-linux-loong64"];e?e.integrity:""' "$ROOT/package-lock.json" 2>/dev/null || true)"
  if [ -z "$url" ] || [ -z "$ver" ]; then
    echo "[loong64-package] WARN: @koromix/koffi-linux-loong64 not recorded in package-lock.json; skipping" >&2
    return 0
  fi
  echo "[loong64-package] fetching koffi-linux-loong64 v$ver from registry"
  local tmp="$(mktemp -d)"
  if ! curl -fL --retry 3 --retry-all-errors --connect-timeout 30 -o "$tmp/koffi.tgz" "$url"; then
    echo "[loong64-package] WARN: koffi-linux-loong64 download failed" >&2
    rm -rf "$tmp"; return 1
  fi
  if [ -n "$integ" ]; then
    local computed
    computed="sha512-$(node -e 'const c=require("crypto"),fs=require("fs");process.stdout.write(c.createHash("sha512").update(fs.readFileSync(process.argv[1])).digest("base64"))' "$tmp/koffi.tgz")"
    if [ "$computed" != "$integ" ]; then
      echo "[loong64-package] ERROR: koffi-linux-loong64 integrity mismatch (got $computed, lock $integ)" >&2
      rm -rf "$tmp"; return 1
    fi
  fi
  mkdir -p "$ROOT/node_modules/@koromix"
  tar -xzf "$tmp/koffi.tgz" -C "$tmp"
  mv "$tmp/package" "$dest"
  rm -rf "$tmp"
  if [ -z "$(find "$dest" -name koffi.node -print -quit 2>/dev/null)" ]; then
    echo "[loong64-package] WARN: koffi-linux-loong64 extracted without koffi.node" >&2
  else
    echo "[loong64-package] koffi-linux-loong64 v$ver injected (integrity verified)"
  fi
}

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
# Byte-exact pristine copy of build/harness-node-entry.mjs taken by
# patch_harness_selfheal; restore_harness_entry copies it back at EXIT.
SELFHEAL_PRISTINE=""
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

# The harness's shared fallback directory
# ($DSH_HOME/profiles/node_modules) is generated per install by walking the
# dependency closure of the `dsh` package (@deepseek-ai/dsh profile-boot
# INSTALL_ANCHOR). App-level `file:` workspace packages that that closure does
# not reach — dsh-desktop-client-ui, dsh-desktop-market-installer,
# dsh-desktop-hmr-fallback, dsh-desktop-preset-transfer and
# @deepseek-ai/dsh-experimental-kimi-ppt-standard-adapter — are therefore never
# linked on a fresh install, and the loader's cordis:include fails with
# "Cannot find package '...'", killing the whole plugin tree. This is an
# upstream closure gap, not a packaging defect (the packages themselves are in
# resources/app/node_modules). Build-time self-heal: patch
# build/harness-node-entry.mjs (packaged via extraResources and the first code
# the bundled harness node runs) so each fresh install links those five packages
# into the shared fallback dir before the dsh entry loads. Idempotent: existing
# links are left untouched, and it no-ops when DSH_HOME is unset or the fallback
# dir does not exist yet. The file is restored afterwards so the working tree
# never carries the patch.
SELFHEAL_PACKAGES=(
  "dsh-desktop-client-ui"
  "dsh-desktop-market-installer"
  "dsh-desktop-hmr-fallback"
  "dsh-desktop-preset-transfer"
  "@deepseek-ai/dsh-experimental-kimi-ppt-standard-adapter"
)

# Marker comment the self-heal patch inserts so it is idempotent and restorable.
SELFHEAL_MARKER="loong64-selfheal-marker"

# Build the self-heal block: ESM-only (the entry is a .mjs, so no require()).
# Defined as a function so the heredoc keeps shell-expansion control.
selfheal_js() {
  local pkg_json="$(printf '%s\n' "${SELFHEAL_PACKAGES[@]}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(s.trim().split('\n'))))")"
  cat <<EOF
// ${SELFHEAL_MARKER}: link app-level packages the dsh dependency closure does
// not cover into the harness shared fallback dir before the dsh entry loads.
;(async () => {
  const dshHome = process.env.DSH_HOME
  if (dshHome) {
    const { existsSync, mkdirSync, symlinkSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const packages = ${pkg_json}
    const appNodeModules = fileURLToPath(new URL('./app/node_modules/', import.meta.url))
    const fallbackDir = join(dshHome, 'profiles', 'node_modules')
    for (const packageName of packages) {
      const target = join(appNodeModules, packageName)
      const link = join(fallbackDir, packageName)
      try {
        if (!existsSync(join(target, 'package.json'))) continue
        mkdirSync(dirname(link), { recursive: true })
        if (!existsSync(link)) symlinkSync(target, link, 'dir')
      } catch {
        // best-effort; the app boots without the fallback links if it fails
      }
    }
  }
})().catch(() => {})
EOF
}

patch_harness_selfheal() {
  local entry="$ROOT/build/harness-node-entry.mjs"
  [ -f "$entry" ] || { echo "[loong64-package] WARN: $entry missing; skipping self-heal patch" >&2; return 0; }
  if grep -q "$SELFHEAL_MARKER" "$entry"; then
    echo "[loong64-package] harness self-heal patch already applied"
    return 0
  fi
  echo "[loong64-package] patching harness-node-entry.mjs with profiles self-heal"
  # Keep a pristine copy so restore is a byte-exact copy instead of string surgery.
  SELFHEAL_PRISTINE="$(mktemp)"
  cp -f "$entry" "$SELFHEAL_PRISTINE"
  local block="$(selfheal_js)"
  node -e "
const fs=require('fs');
const path=process.argv[1], block=process.argv[2];
let s=fs.readFileSync(path,'utf8');
const anchor=\"const [dshEntryPath, ...dshArguments] = process.argv.slice(2)\";
const at=s.indexOf(anchor);
if(at<0){console.error('harness-node-entry anchor not found');process.exit(1)}
s=s.slice(0,at)+block+'\n\n'+s.slice(at);
fs.writeFileSync(path,s);
" "$entry" "$block"
  if ! grep -q "$SELFHEAL_MARKER" "$entry"; then
    echo "[loong64-package] ERROR: failed to apply harness self-heal patch" >&2
    return 1
  fi
  echo "[loong64-package] harness self-heal patch applied"
}

# Undo the harness self-heal patch after packaging (byte-exact restore from the
# pristine copy taken by patch_harness_selfheal). Global SELFHEAL_PRISTINE.
restore_harness_entry() {
  local entry="$1"
  [ -f "$entry" ] || return 0
  if [ -z "$SELFHEAL_PRISTINE" ] || [ ! -f "$SELFHEAL_PRISTINE" ]; then
    return 0
  fi
  cp -f "$SELFHEAL_PRISTINE" "$entry"
  rm -f "$SELFHEAL_PRISTINE"
  SELFHEAL_PRISTINE=""
  echo "[loong64-package] harness-node-entry.mjs restored"
}

main() {
  echo "== DSH Desktop loong64 package: $(date -Is) =="
  echo "repo=$ROOT node=$(node --version)"
  bootstrap_native_assets
  ensure_koffi_loong64
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
  fi

  echo "[loong64-package] building renderer/main with electron-vite"
  ( cd "$ROOT" && npm run build ) || { echo "[loong64-package] ERROR: electron-vite build failed" >&2; exit 3; }

  # Apply the harness self-heal patch before electron-builder packs extraResources.
  # A single EXIT trap restores BOTH the baked package.json version and the
  # pristine harness entry afterwards, so the working tree is never left dirty.
  local harness_entry="$ROOT/build/harness-node-entry.mjs"
  if [ "$deb_version" != "$baked_version" ]; then
    trap "restore_pkg_version '$pkg_json' '$baked_version'; restore_harness_entry '$harness_entry'" EXIT
  else
    trap "restore_harness_entry '$harness_entry'" EXIT
  fi
  patch_harness_selfheal || { echo "[loong64-package] ERROR: harness self-heal patch failed" >&2; exit 6; }

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
