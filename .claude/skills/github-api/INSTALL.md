# GitHub CLI Installation

**Only consult this file if gh is not already available.**

## Check for Existing Installation

Always check before installing:

```bash
GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
if command -v gh &> /dev/null; then
  GH="gh"
  echo "✓ Using system gh"
elif [ -f "$GH" ]; then
  echo "✓ Using existing /tmp installation"
else
  echo "✗ No gh found, installation required"
fi
```

## Optimistically Test Access

Try using gh immediately - if it works, you're done:

```bash
$GH pr list --repo starwards/starwards --limit 3
```

**If successful:** gh is working correctly. No further steps needed.

**If fails:** Continue to token verification and installation below.

## Verify GITHUB_TOKEN

If test access failed, verify token is set correctly:

```bash
if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN environment variable is not set"
  echo ""
  echo "GitHub CLI requires authentication via GITHUB_TOKEN."
  echo "Please set the token in your environment before using this skill."
  echo ""
  echo "Expected token formats:"
  echo "  - Classic tokens:      ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  echo "  - Fine-grained tokens: github_pat_xxxxxxxxxxxxxxxxxxxxx"
  exit 1
fi

TOKEN_PREFIX=$(echo "$GITHUB_TOKEN" | cut -c1-4)
if [ "$TOKEN_PREFIX" != "ghp_" ] && [ "$TOKEN_PREFIX" != "gith" ]; then
  echo "⚠ WARNING: GITHUB_TOKEN format may be incorrect"
  echo "Expected to start with 'ghp_' (classic) or 'github_pat_' (fine-grained)"
  echo "Current prefix: $TOKEN_PREFIX"
  echo ""
  echo "Continuing anyway, but authentication may fail..."
fi

echo "✓ GITHUB_TOKEN is set ($(echo $GITHUB_TOKEN | head -c 20)...)"
```

## Install GitHub CLI

Only if no existing gh was found:

```bash
mkdir -p /tmp/gh-install && cd /tmp/gh-install && \
curl -sL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o gh.tar.gz && \
tar xzf gh.tar.gz && \
echo "✓ GitHub CLI installed to /tmp/gh-install"
```

## Verify Installation

Confirm gh is working:

```bash
GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
$GH --version
$GH auth status
```

Expected auth status output:
```
✓ Logged in to github.com account USERNAME (GITHUB_TOKEN)
```

## Test Access

Verify API access works:

```bash
$GH pr list --repo starwards/starwards --limit 3
```

**If this still fails, check:**
1. GITHUB_TOKEN is valid and not expired
2. Token has required permissions (Contents: Read, Pull requests: Read, Actions: Read)
3. Repository name format is correct: OWNER/REPO
4. Network connectivity to github.com