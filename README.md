# NetcoreWorkspace

A peer-to-peer workspace for real-time messaging, file sharing, video calls, and team collaboration, powered by NetcoreNetwork.

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
