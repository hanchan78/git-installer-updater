# Git Installer & Updater

An Obsidian plugin for manually installing and updating built plugins from public GitHub repositories. GitHub releases and release assets are unnecessary. Only `manifest.json`, `main.js`, and optional `styles.css` are downloaded; repository scripts are never run. Trust the repositories you install: their code runs inside Obsidian when enabled.

## Install the manager

Using a GitHub plugin updater, add this repository, select branch `main`, and leave **Built files directory** blank: the finished files live at the repository root. Review the manifest, install, then enable **Git Installer & Updater** in Community plugins. To let the manager update itself, add the same repository in its settings and choose **Track existing installation**.

Copy the built `main.js`, `manifest.json`, and `styles.css` from this directory into `<vault>/<configuration-directory>/plugins/git-installer-updater/`. The usual configuration directory is `.obsidian`, but this manager uses the vault's actual configuration directory. Restart Obsidian, then enable **Git Installer & Updater** under Community plugins. This workspace already occupies that plugin directory; after building, restart Obsidian and enable it manually. Development does not enable it or modify other plugins.

## Add and update repositories

Open the manager's settings, choose **Add repository**, and enter `owner/repository` or `https://github.com/owner/repository`. Leave Branch blank to resolve the repository's default branch, or enter a branch explicitly. This resolved branch is stored; changing GitHub's default later does not change tracking. Set a relative built-files directory such as `dist`, or leave it blank for the repository root.

Choose **Review manifest** to see name, ID, version, minimum Obsidian version, and platform compatibility. Track without installation, or explicitly install a compatible uninstalled plugin. Existing installations are tracked without overwriting them. New installations remain disabled; enable them yourself in Community plugins. Editing allows changing branch and directory, but changing the source repository or plugin ID requires removing tracking and adding it again.

**Check** reads the installed manifest from disk and compares its semantic version to the remote manifest. Checks never modify plugin files. **Update** installs a newer compatible version. **Check for updates** checks all entries. **Update all** checks and updates installed plugins sequentially, skips entries that have never been installed, continues after individual failures, and shows a result summary. Equal or older remote versions are never installed. Prerelease versions follow semantic version ordering. Removing tracking leaves the installed files and settings intact.

## Publish your plugins

Keep finished `main.js`, `manifest.json`, and optional `styles.css` in the configured publication directory and **commit them to Git**. Increase the manifest version, build, commit the built files, then push to the tracked branch. A new commit without a newer manifest version does not trigger an update. Do not commit `data.json`, credentials, dependencies, or temporary files.

For this manager, the publication directory is the repository root:

```sh
npm install
npm test
npm run build
git add src tests package.json package-lock.json tsconfig.json build.mjs test.mjs README.md .gitignore main.js manifest.json styles.css
git commit -m "Publish Git Installer & Updater"
git push
```

The publication branch is `main`. Built artifacts are intentionally tracked. Increase the manifest version before publishing an update; rebuild and commit the finished files alongside the source.

## Preservation and restarts

Downloads are pinned to one commit. All downloads complete before replacing files. Staged files and backups are stored temporarily inside the target plugin directory. `data.json` and unrelated files are never replaced. An obsolete stylesheet is deleted only if a prior installation by this manager recorded ownership. A preexisting stylesheet from an externally installed plugin is retained until this manager actually installs a stylesheet.

Replacement failures restore the previous program files. If restoration itself fails, the error reports a retained `.backup-*` directory containing original files and `recovery.json` describing previously absent files. Close Obsidian and use that backup to restore the named files before restarting. Backups may also remain after failed operations with successful rollback. Unexpected process termination or power loss during replacement is not automatically recovered; inspect the retained backup. Do not run external updaters concurrently with this manager.

There is no public Obsidian API for reloading another plugin or reading its enabled state. A small feature-detected internal compatibility layer unloads/reloads enabled plugins without changing the saved enabled set. When those methods are unavailable, or reload fails, restart is required. Plugin reload behavior depends on Obsidian and the target plugin correctly unloading. Public vault adapter APIs handle files, and public `requestUrl` handles downloads.

Track this manager's repository like any other plugin. Its self-update runs last, never unloads the coordinating manager, preserves `data.json`, and activates on restart. After a successful self-update, restart before attempting another update. Disabled plugins remain disabled; a newly installed plugin is not automatically enabled.

## Scope and verification

Public repositories only; no tokens, private repositories, scheduling, background updates, or telemetry. GitHub's unauthenticated rate limits apply. Desktop-only target plugins are rejected on mobile. The manager uses platform-independent Obsidian APIs, but mobile network/filesystem behavior and internal reload support require device testing.

Tests use isolated in-memory vault fixtures for semantic versions, manifest/path validation, commit-consistent downloads, missing stylesheets versus server failures, installations, settings preservation, managed stylesheet removal, rollback, malformed settings, duplicate sources, and self-update ordering. TypeScript and the production bundle are checked by the build. Live Obsidian UI, enable/unload/reload behavior, and device behavior must still be tested manually. No installed plugins in the real vault were updated during development.

The dependency audit reports a moderate advisory in `moment`, a dependency of the development-only Obsidian type package. Neither that package nor Moment is included in the built plugin. Do not apply the audit's proposed downgrade to obsolete Obsidian types; Obsidian itself supplies the runtime API.
