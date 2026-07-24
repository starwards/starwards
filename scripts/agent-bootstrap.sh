#!/usr/bin/env bash
# Session-start bootstrap for the starwards dev agent sandbox.
# Runs BEFORE Claude Code launches. Best-effort and idempotent: each step
# logs OK/SKIP/FAIL and the script never aborts the session on failure.
# Origin: recurring friction in agent run logs (missing gh CLI, cold
# node_modules, Playwright chromium revision mismatch).

set -u

REPO_ROOT="${STARWARDS_REPO:-$(pwd)}"
SUMMARY=()

note() { SUMMARY+=("$1: $2"); echo "[bootstrap] $1: $2"; }

# Make a PATH addition visible to the Claude Code session launched after this
# script exits (an in-process `export PATH` alone dies with this script).
persist_path() {
    local dir="$1" line
    line="export PATH=\"$dir:\$PATH\""
    export PATH="$dir:$PATH"
    for profile in "$HOME/.bashrc" "$HOME/.profile"; do
        grep -qsF "$line" "$profile" 2>/dev/null || echo "$line" >>"$profile"
    done
}

# --- 1. gh CLI ---------------------------------------------------------------
if command -v gh >/dev/null 2>&1; then
    note "gh" "OK (already installed: $(gh --version | head -n1))"
else
    installed=""
    if command -v apt-get >/dev/null 2>&1; then
        (sudo apt-get update -y && sudo apt-get install -y gh) >/dev/null 2>&1 && installed=apt
    fi
    if [ -z "$installed" ] && command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y gh >/dev/null 2>&1 && installed=dnf
    fi
    if [ -z "$installed" ] && command -v apk >/dev/null 2>&1; then
        sudo apk add github-cli >/dev/null 2>&1 && installed=apk
    fi
    if [ -z "$installed" ]; then
        # Fallback: latest release tarball into ~/.local/bin
        arch="$(uname -m)"; case "$arch" in x86_64) arch=amd64 ;; aarch64) arch=arm64 ;; esac
        ver="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -oP '"tag_name":\s*"v\K[^"]+' | head -n1)"
        if [ -n "${ver:-}" ]; then
            mkdir -p "$HOME/.local/bin" &&
            curl -fsSL "https://github.com/cli/cli/releases/download/v${ver}/gh_${ver}_linux_${arch}.tar.gz" |
                tar -xz -C /tmp &&
            cp "/tmp/gh_${ver}_linux_${arch}/bin/gh" "$HOME/.local/bin/gh" &&
            persist_path "$HOME/.local/bin" && installed=tarball
        fi
    fi
    if command -v gh >/dev/null 2>&1; then
        note "gh" "OK (installed via $installed)"
    else
        note "gh" "FAIL (agent must fall back to GitHub MCP tools)"
    fi
fi

# gh auth: GH_TOKEN env var is enough; just report status.
# Check via REST (`gh api user`), NOT `gh auth status` — the cloud sandbox's
# GitHub proxy blocks GraphQL (except a pinned set of PR-review operations),
# and `gh auth status` validates over GraphQL, so it reports valid tokens as
# invalid. Same proxy limit means GraphQL-backed gh porcelain (`gh pr list`,
# `gh issue list`, `gh pr view`) fails in the sandbox even with good auth —
# agents should use `gh api` REST endpoints or MCP for those.
# Probe a REPO endpoint, not /user: user-level auth can succeed while every
# repo-scoped call 403s ("GitHub access is not enabled for this session")
# until the Claude GitHub App is connected for the org.
if command -v gh >/dev/null 2>&1; then
    if repo_name="$(gh api repos/starwards/starwards -q .full_name 2>/dev/null)" && [ -n "$repo_name" ]; then
        note "gh-auth" "OK (REST repo access; GraphQL porcelain may still fail — use gh api or MCP)"
    elif login="$(gh api user -q .login 2>/dev/null)" && [ -n "$login" ]; then
        note "gh-auth" "PARTIAL (user auth OK as $login but repo REST blocked — use MCP; org admin must connect the Claude GitHub App)"
    else
        note "gh-auth" "FAIL (REST check; fall back to MCP)"
    fi
fi

# --- 2. npm dependencies -----------------------------------------------------
if [ -f "$REPO_ROOT/package-lock.json" ]; then
    if [ -d "$REPO_ROOT/node_modules" ]; then
        note "npm-ci" "SKIP (node_modules present)"
    elif (cd "$REPO_ROOT" && npm ci); then
        note "npm-ci" "OK"
    else
        note "npm-ci" "FAIL (agent must run npm ci before tests)"
    fi
else
    note "npm-ci" "SKIP (no package-lock.json at $REPO_ROOT — set STARWARDS_REPO)"
fi

# --- 3. Playwright chromium (repo pins a newer revision than the sandbox) ----
if [ -d "$REPO_ROOT/node_modules" ]; then
    if (cd "$REPO_ROOT" && npx playwright install --with-deps chromium) >/dev/null 2>&1 ||
       (cd "$REPO_ROOT" && npx playwright install chromium) >/dev/null 2>&1; then
        note "playwright" "OK (pinned chromium installed)"
    else
        note "playwright" "FAIL (e2e may fail on browser revision; agent should skip e2e for non-UI work)"
    fi
else
    note "playwright" "SKIP (no node_modules)"
fi

# --- Summary -----------------------------------------------------------------
echo
echo "[bootstrap] summary:"
printf '  %s\n' "${SUMMARY[@]}"
