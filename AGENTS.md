# AGENTS

## Release Workflow

- When bumping the project version, always use `scripts/release.sh <patch|minor|major>`.
- Do not update version fields manually when doing a normal release.
- Do not run `npm version` directly for releases.
- The release script is the source of truth for syncing version metadata across:
  - `package.json`
  - `package-lock.json`
  - `public/manifest.json`
  - `src/panel/App.tsx`
- The release script requires a clean Git working tree, creates the release commit, creates the Git tag, and pushes both the branch and the tag.
- Because the script pushes to `origin`, only run it when the user explicitly wants to publish a release.

## Manual Version Edits

- If a task is not a real release and only needs local version-related testing, prefer avoiding version changes unless the user explicitly asks for them.
- If version metadata must be changed outside the release flow for a special task, keep `package.json`, `public/manifest.json`, and `src/panel/App.tsx` consistent.
