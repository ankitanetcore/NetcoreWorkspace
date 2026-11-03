# Launch readiness report

Date: November 3, 2026. This work is local and has not been committed or pushed. The repository was not made public and nothing was deployed.

The security findings from the November 2 review were already fixed and pushed in `bb055fa`. This pass checked the app again for a public launch and fixed the remaining blockers that did not need a new architecture.

## A. Changes implemented

- `server/web-server.mjs`
  - Startup prints `Listening on <bind>` and `Open http://127.0.0.1:<port>`.
  - `ALLOWED_HOSTS` accepts named tunnel or proxy hosts. `*` is ignored. Every other hostname is still rejected.
  - The device cookie is `Secure` only when the request is HTTPS or `X-Forwarded-Proto` is `https`.
  - `SIGTERM` and `SIGINT` close the servers without touching workspace data.
  - A missing host display name falls back to `Host` instead of a personal name.
  - A new workspace welcome message no longer says the product is privately connected. Existing workspace files are not rewritten.
- `server/launch.test.mjs` and `package.json`
  - `npm test` starts a temporary server and checks host rejection, an allowed tunnel host, session cookies, anonymous WebSocket rejection, and that a forged author is stored as the signed-in participant.
  - `npm run typecheck` runs `tsc --noEmit`.
- `.env.example` documents `ALLOWED_HOSTS`.
- `README.md` describes a self-hosted server, configuration, privacy, and troubleshooting. It no longer calls the app peer-to-peer.
- `CONTRIBUTING.md`, `SECURITY.md`, and `.github/workflows/check.yml` are new. The workflow runs typecheck and `npm test` on Node 22. It has not been run on GitHub yet.

No Causeway code was added. No user workspace was reset. After this report was first written, `LICENSE` was replaced with the MIT License, copyright 2026 AnkitaU. That change is local and has not been pushed.

## B. Security improvements

Already on `origin/main` before this pass: device sessions, origin and host checks, loopback by default, room ownership, file audience checks, safe previews, bounded transfers, atomic saves, and call teardown. See `bb055fa`.

This pass adds an explicit allowlist for tunnel hostnames and marks the session cookie `Secure` on HTTPS. The threat model is documented in `SECURITY.md`.

Remaining security concerns:

- `npm audit` reports 19 advisories (6 high, 11 moderate, 2 low, 0 critical). The offered fix is Expo SDK 58, a major upgrade from the current SDK 57. That upgrade was not applied because it can break the app. The advisories are in the Expo toolchain (`node-forge`, `glob`, `zod`, `decode-uri-component`, and related packages), not in the workspace server's own request path.
- Data is plaintext on disk. The server operator can read messages, files, profiles, and device secrets. There is no end-to-end encryption.
- The first browser to register a device id owns it. There is no recovery if that browser loses the secret.
- Fonts are loaded from Google Fonts and Fontshare, so a browser contacts those services.
- The native app still uses a mock transport and a call stub.

## C. Functionality verification

| Feature | Result |
|---|---|
| Server starts on loopback and prints a local URL | Passed in `npm test` |
| Tunnel hostname allowlist, foreign host rejected | Passed in `npm test` |
| Session cookie and anonymous WebSocket rejected | Passed in `npm test` |
| Two sockets; a forged message author is ignored | Passed in `npm test` |
| Malformed path returns 400 and the process stays up | Passed in `npm test` |
| Onboarding, Rooms, and the Files list in a browser | Passed earlier today against the current client |
| Direct messages, threads, edit, and reactions in two browsers | Not verified in the browser |
| File upload, folder moves, and preview of a new upload | Not verified in the browser. The Files list rendered starter documents |
| Calls, mute, screen share, and media cleanup | Not verified. Code from the earlier security pass ends a call on revoke, inactive status, and room delete |
| Persistence after a real restart of an existing workspace | Not verified against `server/data`. The test used a temporary directory and deleted it |
| Native iOS and Android | Not verified. Those entry points are mocks |

## D. Test results

| Check | Result |
|---|---|
| `node --check server/web-server.mjs` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm test` | Passed. 1 test, 0 failures |
| `npx expo export --platform web` | Passed. Output written to `dist/` |
| `npx expo lint` | Not run to completion. The repository has no ESLint config, and the automatic setup download was blocked |
| `npm audit` | Completed with findings. See section B. No package was upgraded |
| GitHub Actions workflow | Added. Not executed on GitHub |
| Existing unit tests | There were none before `server/launch.test.mjs` |

This machine is Node v20.15.1. The project asks for Node 22.13 or newer, and Expo printed that this Node is older than 20.19.4. Typecheck, the server test, and the web export still completed.

## E. Remaining issues

Critical before a public repository:

- None for the license. `LICENSE` is now the MIT License, copyright 2026 AnkitaU. It still needs to be committed and pushed before the public repository shows it.

Not a code blocker, but not done:

- Expo SDK 58 is the audited fix for the current advisories. Confirm before upgrading.
- Run the new GitHub workflow on the remote.
- Add ESLint only if a config can be committed without a large unrelated cleanup.
- Exercise calls and two-browser chat, files, and direct messages on Node 22.
- Decide whether fonts should be bundled so the browser does not contact Google and Fontshare.

Optional:

- Account recovery for a lost device secret.
- A native transport. The web server is the product that can be launched.

## F. Open-source launch checklist

| Item | Status |
|---|---|
| Install and startup documented | Done |
| `.env.example` and `.gitignore` | Done. `.env` and `server/data*` are ignored |
| `CONTRIBUTING.md` and `SECURITY.md` | Done |
| Automated check workflow | Added, not yet run on GitHub |
| Secrets removed from git | No secret files are tracked |
| License selected for this project | Done locally. MIT, copyright 2026 AnkitaU. Not pushed yet |
| Claims match the implementation | README and the new-workspace welcome message were corrected. No end-to-end encryption is claimed |
| Causeway left unchanged | Done |

## G. Final recommendation

1. Public open-source beta: **CONDITIONAL**. The web app can be installed, started on localhost, and used as a self-hosted workspace. The license is MIT. Do not make the repository public until this local work is committed, pushed, and reviewed. Publish with the privacy wording now in the README, not with peer-to-peer or end-to-end claims.

2. Production use: **NOT READY**. There is no encryption at rest, no end-to-end encryption, no account recovery, and no operator-independent access control. One Node process holds the workspace.

3. Paid advertising: **NOT READY**. Call behavior across networks was not verified, and the native apps are not the product. Advertising can wait until a second browser has been used for chat, files, and a call.
