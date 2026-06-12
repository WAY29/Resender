#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <patch|minor|major>" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

bump_type="$1"
case "$bump_type" in
  patch|minor|major) ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ ! -f package.json ]]; then
  echo "Error: package.json not found in the current directory." >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: current directory is not a Git repository." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: Git working tree is not clean. Commit or stash your changes first." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "Error: detached HEAD is not supported for releases." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Error: Git remote 'origin' is not configured." >&2
  exit 1
fi

npm version "$bump_type" --no-git-tag-version >/dev/null

new_version="$(node -p "require('./package.json').version")"
new_tag="v${new_version}"

node <<'EOF'
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const newVersion = packageJson.version;

const manifestPath = 'public/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

const appPath = 'src/panel/App.tsx';
if (fs.existsSync(appPath)) {
  const source = fs.readFileSync(appPath, 'utf8');
  const updated = source.replace(/version: \"[^\"]+\",/, `version: \"${newVersion}\",`);
  if (updated !== source) {
    fs.writeFileSync(appPath, updated);
  }
}
EOF

if git rev-parse "$new_tag" >/dev/null 2>&1; then
  echo "Error: tag ${new_tag} already exists." >&2
  exit 1
fi

files=(package.json)
if [[ -f public/manifest.json ]]; then
  files+=(public/manifest.json)
fi
if [[ -f src/panel/App.tsx ]]; then
  files+=(src/panel/App.tsx)
fi
if [[ -f package-lock.json ]]; then
  files+=(package-lock.json)
fi
if [[ -f npm-shrinkwrap.json ]]; then
  files+=(npm-shrinkwrap.json)
fi

git add "${files[@]}"
git commit -m "Release ${new_version}"
git tag -a "$new_tag" -m "$new_tag"
git push origin "$current_branch"
git push origin "$new_tag"

echo "Released ${new_version} on ${current_branch} and pushed ${new_tag}."
