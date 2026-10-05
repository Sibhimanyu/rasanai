#!/usr/bin/env bash
# RasanAI setup: everything a run needs, in one command that itself needs only bash and curl.
#
#   bash setup.sh [--open]        find (or fetch) Node, update RasanAI if a newer release is out, check HyperFrames and the
#                                 browser, make the run folder, start the Director's Console
#   bash setup.sh --new           the same, but always a fresh run (a new video) rather than resuming an unfinished one
#   bash setup.sh --node-only     just make sure Node >= 20 is available (used by install.sh)
#
# Prints KEY=VALUE lines (SKILL_DIR, RUN, NODE, PATH_PREFIX, UPDATE, UPDATED, HYPERFRAMES, BROWSER, CONSOLE, IMAGEGEN, IMAGEGEN_MODEL, MODEL, HARNESS)
# (MODEL and HARNESS: the model running this session and where it runs, claude-code | codex | other; pass MODEL as --model to crew.mjs)
# and PROBLEM: lines with the fix, then READY, or FAILED when a run can't start.
# Node: the PATH first, then nvm / fnm / Volta / asdf / Homebrew / ~/.rasanai/node; if none is
# >= 20, a private copy of the current Node LTS is downloaded from nodejs.org into
# ~/.rasanai/node (checksum-verified; no sudo, nothing system-wide changes).
# Set RASANAI_NO_NODE_DOWNLOAD=1 to never download. PROBLEM: and NOTE: lines go to stderr.
set -uo pipefail

# RasanAI was called Rasa Director up to 1.0: its RASA_DIRECTOR_* settings still apply, and ~/.rasa-director
# (memory, the private Node, the installer's checkout) moves to ~/.rasanai, leaving a link behind for old paths
for v in $(compgen -e | grep '^RASA_DIRECTOR_' || true); do n="RASANAI_${v#RASA_DIRECTOR_}"; [ -n "${!n:-}" ] || export "$n=${!v}"; done
if [ -z "${RASANAI_HOME:-}" ] && [ ! -e "$HOME/.rasanai" ] && [ -d "$HOME/.rasa-director" ] && [ ! -L "$HOME/.rasa-director" ]; then
  mv "$HOME/.rasa-director" "$HOME/.rasanai" && ln -s "$HOME/.rasanai" "$HOME/.rasa-director"
fi

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOME_DIR="${RASANAI_HOME:-$HOME/.rasanai}"
NODE_LINE="${RASANAI_NODE_LINE:-22}"
OPEN=""; NODE_ONLY=""; NEW=""
for a in "$@"; do
  case "$a" in
    --open) OPEN="--open" ;;
    --new) NEW=1 ;;
    --node-only) NODE_ONLY=1 ;;
  esac
done

problem() { echo "PROBLEM: $*" >&2; }

node_ok() { # $1 = a node binary; true when it runs and is >= 20
  local v
  v=$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
  [ -n "$v" ] && [ "$v" -ge 20 ] 2>/dev/null
}

# every installed copy (skills folders, the plugin cache, this one), newest VERSION first
newest_skill_dir() {
  local d
  { for d in "$HOME/.claude/skills/rasanai" "$HOME/.agents/skills/rasanai" ".claude/skills/rasanai" "$SKILL_DIR"; do echo "$d"; done
    find "$HOME/.claude/plugins/cache" -maxdepth 6 -type d -path '*rasanai*/skills/rasanai' 2>/dev/null; } |
  while IFS= read -r d; do [ -f "$d/SKILL.md" ] && echo "$(cat "$d/VERSION" 2>/dev/null || echo 0) $(cd "$d" && pwd -P)"; done |
  sort -V | tail -1 | cut -d' ' -f2-
}

node_candidates() { # one path per line, newest version first within each manager
  printf '%s\n' "$HOME_DIR/node/bin/node" "$HOME_DIR/node/node.exe"
  ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -rV
  ls -d "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node "$HOME/Library/Application Support/fnm/node-versions"/*/installation/bin/node 2>/dev/null | sort -rV
  printf '%s\n' "$HOME/.volta/bin/node" "$HOME/.asdf/shims/node" "$HOME/.local/share/mise/shims/node" \
    /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "/c/Program Files/nodejs/node.exe"
}

find_node() {
  local c
  [ "${RASANAI_SKIP_NODE_SEARCH:-0}" = "1" ] && return 1 # tests: behave as if no Node is installed
  if command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then command -v node; return 0; fi
  while IFS= read -r c; do
    [ -n "$c" ] && [ -x "$c" ] && node_ok "$c" && { echo "$c"; return 0; }
  done < <(node_candidates)
  return 1
}

download_node() {
  local os arch ext base sums file sum tmp got
  case "$(uname -s)" in
    Darwin) os=darwin; ext=tar.gz ;;
    Linux) os=linux; ext=tar.xz ;;
    MINGW*|MSYS*|CYGWIN*) os=win; ext=zip ;;
    *) problem "no Node download for $(uname -s); install Node >= 20 from https://nodejs.org"; return 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64) arch=x64 ;;
    *) problem "no Node download for $(uname -m); install Node >= 20 from https://nodejs.org"; return 1 ;;
  esac
  [ "$os" = linux ] && ! command -v xz >/dev/null 2>&1 && ext=tar.gz
  command -v curl >/dev/null 2>&1 || { problem "curl is needed to download Node; install Node >= 20 from https://nodejs.org"; return 1; }
  base="https://nodejs.org/dist/latest-v${NODE_LINE}.x"
  sums=$(curl -fsSL --max-time 20 "$base/SHASUMS256.txt") || { problem "could not reach nodejs.org; install Node >= 20 from https://nodejs.org"; return 1; }
  file=$(printf '%s\n' "$sums" | awk '{print $2}' | grep -E "^node-v[0-9.]+-${os}-${arch}\.${ext}$" | head -1)
  [ -n "$file" ] || { problem "nodejs.org has no ${os}-${arch} build; install Node >= 20 from https://nodejs.org"; return 1; }
  sum=$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f {print $1}')
  echo "NOTE: Node >= 20 not found; downloading ${file%.$ext} from nodejs.org into $HOME_DIR/node (private to RasanAI)" >&2
  tmp=$(mktemp -d)
  curl -fsSL --max-time 300 -o "$tmp/$file" "$base/$file" || { problem "Node download failed"; rm -rf "$tmp"; return 1; }
  if command -v shasum >/dev/null 2>&1; then got=$(shasum -a 256 "$tmp/$file" | awk '{print $1}'); else got=$(sha256sum "$tmp/$file" | awk '{print $1}'); fi
  [ "$got" = "$sum" ] || { problem "Node download failed its checksum; not installed"; rm -rf "$tmp"; return 1; }
  case "$ext" in
    zip) (cd "$tmp" && unzip -q "$file") ;;
    tar.xz) tar -xJf "$tmp/$file" -C "$tmp" ;;
    *) tar -xzf "$tmp/$file" -C "$tmp" ;;
  esac || { problem "could not unpack $file"; rm -rf "$tmp"; return 1; }
  mkdir -p "$HOME_DIR" && rm -rf "$HOME_DIR/node" && mv "$tmp/${file%.$ext}" "$HOME_DIR/node"
  rm -rf "$tmp"
  [ -x "$HOME_DIR/node/bin/node" ] && echo "$HOME_DIR/node/bin/node" && return 0
  [ -x "$HOME_DIR/node/node.exe" ] && echo "$HOME_DIR/node/node.exe" && return 0
  problem "Node unpacked but no binary found"; return 1
}

NODE=$(find_node)
if [ -z "$NODE" ]; then
  if [ "${RASANAI_NO_NODE_DOWNLOAD:-0}" = "1" ]; then
    problem "Node >= 20 is required and none was found; install it from https://nodejs.org (or unset RASANAI_NO_NODE_DOWNLOAD)"
  else
    NODE=$(download_node)
  fi
fi
[ -n "$NODE" ] || { echo "FAILED"; exit 1; }
NODE_BIN="$(dirname "$NODE")"
echo "NODE=$NODE ($("$NODE" -v))"
# Node (and npx) not on the PATH: every later command must run with this prefix
if [ "$(command -v node 2>/dev/null)" != "$NODE" ]; then
  echo "PATH_PREFIX=PATH=\"$NODE_BIN:\$PATH\""
fi
export PATH="$NODE_BIN:$PATH"
[ -n "$NODE_ONLY" ] && { echo "READY"; exit 0; }

echo "SKILL_DIR=$SKILL_DIR"
# one console per video: setup running again mid-video (a new session, a compacted context) picks up the
# unfinished run and its console instead of opening a second tab; --new starts a fresh video
RUN=""
CUR=.rasanai/current
[ -f "$CUR" ] || [ ! -f .rasa-director/current ] || CUR=.rasa-director/current # a video started before the rename resumes where it is
if [ -z "$NEW" ] && [ -f "$CUR" ]; then
  PREV=$(cat "$CUR")
  if [ -d "$PREV" ] && "$NODE" -e '
    const fs = require("fs"), r = process.argv[1];
    const s = JSON.parse(fs.readFileSync(r + "/session.json", "utf8"));
    const fresh = Date.now() - Date.parse(s.updated) < 12 * 3600e3;
    process.exit(fresh && !((s.steps.render || {}).status === "done") ? 0 : 1);' "$PREV" 2>/dev/null; then RUN="$PREV"; echo "RESUMED=$RUN"; fi
fi
[ -n "$RUN" ] || RUN=".rasanai/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN" .rasanai && echo "RUN=$RUN" && printf '%s\n' "$RUN" > .rasanai/current
grep -qx '.rasanai/' .gitignore 2>/dev/null || printf '\n.rasanai/\n' >> .gitignore

# updates first: a newer release is installed the way this copy was installed, then setup starts over from
# the newest copy (a plugin update lands in a new folder), so this run already uses the new version
UPD=$("$NODE" "$SKILL_DIR/scripts/update.mjs" check 2>/dev/null | tr -d '\n' | tr -s ' ')
echo "UPDATE=$UPD"
if printf '%s' "$UPD" | grep -q '"auto_updated": true'; then
  NEW_DIR=$(newest_skill_dir)
  [ -n "$NEW_DIR" ] || NEW_DIR="$SKILL_DIR"
  OLD_V=$(printf '%s' "$UPD" | sed -n 's/.*"current": "\([^"]*\)".*/\1/p')
  echo "UPDATED=$OLD_V -> $(cat "$NEW_DIR/VERSION" 2>/dev/null)"
  echo "NOTE: re-read $NEW_DIR/SKILL.md now; this run continues on the new version" >&2
  rmdir "$RUN" 2>/dev/null # empty only: a fresh run folder; a resumed one keeps its session
  RASANAI_JUST_UPDATED="$OLD_V" exec bash "$NEW_DIR/scripts/setup.sh" "$@"
fi

FAILED=""
if HF=$(npx --yes hyperframes --version 2>&1 | tail -1) && [ -n "$HF" ]; then
  echo "HYPERFRAMES=$HF"
  if npx --yes hyperframes browser ensure >/dev/null 2>&1; then echo "BROWSER=ok"
  else echo "BROWSER=missing"; problem "no headless Chrome: previews open as HTML but there are no stills and no motion check (fix: npx hyperframes browser ensure)"; fi
else
  echo "HYPERFRAMES=missing"; problem "the HyperFrames CLI did not run ($HF); fix: npm i -g hyperframes, or check the network for npx"; FAILED=1
fi

if C=$("$NODE" "$SKILL_DIR/scripts/console.mjs" serve --run "$RUN" $OPEN 2>&1); then
  echo "CONSOLE=$(printf '%s' "$C" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
else
  problem "the Director's Console did not start: $C (retry: node $SKILL_DIR/scripts/console.mjs serve --run $RUN --port 0 --open)"
fi

# image generation through Codex on the user's ChatGPT plan: IMAGEGEN=ready|off|no-codex|signed-out (+ IMAGEGEN_MODEL=).
# status never runs an image; it is given about a second, and its absence or failure only means "unknown".
if [ -f "$SKILL_DIR/scripts/imagegen.mjs" ]; then
  IG_OUT=$(mktemp 2>/dev/null || echo "/tmp/rasanai-imagegen.$$")
  "$NODE" "$SKILL_DIR/scripts/imagegen.mjs" status --kv >"$IG_OUT" 2>/dev/null </dev/null &
  IG_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do kill -0 "$IG_PID" 2>/dev/null || break; sleep 0.1; done
  if kill -0 "$IG_PID" 2>/dev/null; then kill "$IG_PID" 2>/dev/null; echo "IMAGEGEN=unknown"
  elif grep -q '^IMAGEGEN=' "$IG_OUT" 2>/dev/null; then sed 's/ IMAGEGEN_/\
IMAGEGEN_/g' "$IG_OUT" | grep -v '^IMAGEGEN_CODEX=' | head -2
  else echo "IMAGEGEN=unknown"; fi
  rm -f "$IG_OUT"
fi

"$NODE" "$SKILL_DIR/scripts/crew.mjs" model --kv 2>/dev/null || { echo "MODEL=unknown"; echo "HARNESS=other"; }

[ -n "$FAILED" ] && { echo "FAILED"; exit 1; }
echo "READY"
