# NetcoreWorkspace

A self-hosted workspace for real-time messaging, file sharing, video calls, and team collaboration. One Node server stores the workspace. Call audio and video travel directly between browsers when the network allows. NetcoreNetwork and Causeway can connect teammates to that server; this repository does not include Causeway.

One codebase can run as many independent workspaces as you want. Each workspace has its own port and its own data directory. They do not share messages, files, profiles, or settings.

## Requirements

- Node.js 22.13 or newer
- A built web app in `dist/`

## Install

```bash
npm install
cp .env.example .env
npm run web
```

`npm run web` exports the web app and starts the server. With the defaults, the server listens on loopback. Open [http://127.0.0.1:8082](http://127.0.0.1:8082). Set `HOST=0.0.0.0` when this machine should accept connections from other computers on the LAN.

The first time a data directory is empty, the server creates it once:

- a General room with a welcome message from NetcoreWorkspaces
- a Getting Started folder containing the starter documents
- room for the first person to set their own name and profile

Restarting the server does not add that content again. An existing workspace is never treated as new.

## Run another instance

Use a different port and a different data directory. The private team workspace stays on port 8082 with `server/data` when those variables are unset.

```bash
PORT=8083 DATA_DIR=server/data-demo node server/web-server.mjs
```

Open [http://127.0.0.1:8083](http://127.0.0.1:8083). Browser storage is separate per port, so the two instances do not share a login.

`PORT` and `DATA_DIR` can also live in `.env`. A variable already set in the shell wins over `.env`. Relative `DATA_DIR` values start at the repository root. Absolute paths work too.

WebSocket traffic uses the same port as the page, at `/ws`. The address printed at startup is the address to open.

## Causeway

Publish the port this instance is actually using. Teammates add that port in Causeway and open the same port on their own localhost. The setup guides in Getting Started walk through the commands.

## What stays on your machine

`server/data/` and any `server/data-*` directory hold the workspace database, profiles, and uploads. They are gitignored. Do not commit them.

`.env` is gitignored. Copy `.env.example` and fill in your own TURN settings if calls need a relay. Leave them blank to run without one.

The three Getting Started documents live in `server/starter/` and are part of the application. A new workspace copies them into its own storage. Updating the app does not replace files already stored in a workspace.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8082` | HTTP and WebSocket port |
| `HOST` | `127.0.0.1` | Bind address. `0.0.0.0` or `::` listens beyond loopback |
| `DATA_DIR` | `server/data` | Messages, profiles, and uploads for this instance |
| `ALLOWED_HOSTS` | empty | Extra hostnames accepted from a tunnel or reverse proxy |
| `EXPO_PUBLIC_TURN_HOSTS` | empty | Optional TURN server for calls that cannot connect directly |
| `EXPO_PUBLIC_TURN_USERNAME` | empty | TURN username |
| `EXPO_PUBLIC_TURN_CREDENTIAL` | empty | TURN credential |

Startup prints `Open http://127.0.0.1:<port>`. Use that address on this machine. A tunnel should forward to that port, and its public hostname must be listed in `ALLOWED_HOSTS`. A wildcard is ignored.

## Privacy

Messages, files, profiles, and device secrets are stored on the machine running the server. They are not end-to-end encrypted. The person who operates the server can read them. Call media is not stored by this server; a configured TURN server can relay it and would see the media. The browser loads Satoshi, Geist, and Inter from Fontshare and Google Fonts.

## Troubleshooting

- `Missing dist/index.html` means the web export has not been built. Run `npm run web` from the repository root.
- `Could not listen` means that port is already in use. Choose another `PORT`.
- A tunnel returns 403 when its hostname is not in `ALLOWED_HOSTS`, or when the page origin does not match the Host header.
- Two browser profiles on the same port share one workspace and keep separate device identities. A second workspace needs its own `PORT` and `DATA_DIR`.
- Calls with no TURN server work on the same machine and on networks that allow direct browser connections. Other networks need the TURN settings above.

## Checks

```bash
npm run typecheck
npm test
```

`npm test` starts a temporary server on port 8123. It does not read or write `server/data`.

## Known limitations

The native iOS and Android entry points use a local mock transport. The supported multi-user app is the web server started by `npm run web`. There is no account recovery if a browser loses its device secret. This server does not implement Causeway.

## License

NetcoreWorkspace is released under the MIT License. See `LICENSE`.
