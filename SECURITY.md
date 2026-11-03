# Security

NetcoreWorkspace is a self-hosted demo. The server stores messages, files, profiles, and device secrets in `DATA_DIR`. That data is not encrypted at rest, and it is not end-to-end encrypted in transit between the browser and the server. Use HTTPS in front of the server when the network is not trusted.

## Reporting

Please report a vulnerability privately to the maintainer before opening a public issue. Include the version, the request or message that triggers it, and whether it exposes another participant's rooms, direct messages, or files.

## What a participant can rely on

Each browser has a device secret that is not published in the roster. The server derives the actor from that secret. A caller-supplied id does not authorize a download, a direct message, or a room action. Room deletion and membership changes require the room owner. File bytes are served only to a signed-in participant who can see that file.

The server listens on loopback unless `HOST` says otherwise. It rejects a request whose Host is not loopback, an address allowed by a LAN bind, or a name listed in `ALLOWED_HOSTS`.

## Out of scope

- The native mock transport and call stub.
- Causeway, TURN providers, and any proxy placed in front of this server.
- A person who can read `DATA_DIR` or the browser profile where the device secret is stored.
- Physical access to the machine running the server.
