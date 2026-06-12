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

if git rev-parse "$new_tag" >/dev/null 2>&1; then
  echo "Error: tag ${new_tag} already exists." >&2
  exit 1
fi

files=(package.json)
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
