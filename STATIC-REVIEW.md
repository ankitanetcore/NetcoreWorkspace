**NetcoreWorkspace static security review**

Date: November 2, 2026. Reviewed application commit: `e04f6afc0c6a747ce7312a80ec1c8ba67457791b`.

Scope: a demonstration application for home computers and servers. Findings are based on static code analysis; runtime reproduction was not performed. Severity reflects the application's own privacy, integrity, and availability in that setting. Conditional findings apply when the prerequisites below hold. Static analysis cannot establish that every possible vulnerability has been found.

**Result: 9 Major findings and 4 Minor findings. No Critical finding was established.**

| ID | Severity | Finding | Prerequisite |
|---|---|---|---|
| M1 | Major | Client-supplied identity permits impersonation and access to private rooms, DMs, and files | Access to the HTTP/WS endpoint and a participant ID, which the presence roster distributes |
| M2 | Major | The WebSocket endpoint accepts connections from third-party web origins | The browser permits the third-party page to connect to the running endpoint |
| M3 | Major | Attachment previews can execute active content in the application's origin | A participant supplies an active document with misleading preview metadata; another user opens it |
| M4 | Major | File metadata, stored bytes, and transfers lack consistent ownership and permission checks | WS access and knowledge of the relevant file or active transfer ID |
| M5 | Major | Editing a private text attachment broadcasts its content to unrelated participants | A private editable attachment is saved to Files and edited while another client is connected |
| M6 | Major | Unhandled HTTP decoding or file-stream errors can terminate the server | A malformed path reaches Node, or a file read encounters an asynchronous error |
| M7 | Major | Room deletion or membership revocation leaves established media connections open | A call is already established when the room is deleted or a participant is removed |
| M8 | Major | Invalid persisted file metadata or room IDs repeatedly break client rendering | A connected client submits malformed values accepted by the server |
| M9 | Major | A failed state write can lead to permanent loss of application history | A write fails or is interrupted after truncation; subsequent startup and saving replace the damaged state |
| m1 | Minor | Client messages can impersonate server snapshots and replace other clients' visible state | WS access |
| m2 | Minor | Unbounded transfers, history, and send queues can exhaust application resources | Large files, growing history, slow recipients, or repeated unfinished transfers |
| m3 | Minor | An invalid call destination can activate devices while call controls are absent | The user opens a missing or inaccessible call destination and browser media permission is granted |
| m4 | Minor | Deleted rooms leave inaccessible attachment metadata and bytes stored indefinitely | A deleted room had attachments stored on the server |

**Explanations**

The findings principally concern the web implementation: HTTP and WebSocket traffic share a Node server, which stores messages, metadata, and file bytes; WebRTC carries call media between browsers. The server binds to [loopback addresses](server/web-server.mjs#L1532). Access from another computer therefore requires an additional route such as a proxy or tunnel; public exposure is not assumed. An HTTPS frontend selects [WSS](src/transport/webSocketTransport.ts#L52), so a suitably configured HTTPS proxy can protect the external connection. The native implementation uses a [mock transport](src/transport/index.ts#L1) and a [call stub](src/features/call/useRoomCall.ts#L1). Browser restrictions and storage-failure conditions are accounted for in the relevant findings.

**M1 — Client-supplied identity**

The server takes `clientId` from the [connection URL](server/web-server.mjs#L1251) and immediately uses it for the [initial snapshot](server/web-server.mjs#L1427). There is no session, secret, or signature proving that the caller owns that identity. [Actor selection](server/web-server.mjs#L335) also gives `envelope.clientId` precedence over the socket's identity, and `presence/hello` can change that identity after connection. Room messages accept a separately supplied `authorId`. [Media downloads](server/web-server.mjs#L1196) use an equally unverified query-string identity.

Presence distributes participant IDs to connected clients. A client able to reach the endpoint can therefore assert another participant's ID, receive that participant's private room/DM/file data, and perform permitted actions as that participant. This undermines the privacy boundaries offered by those features even in a home demo.

**Fix:** use a server-verified session or a separate device secret that is not published in the roster; bind sockets and downloads to it; derive actor and author identity on the server. Freezing an unverified ID at connection time is insufficient. A shared workspace entry password can restrict admission, but private rooms and DMs still need distinct verified participant identities.

**M2 — Unchecked WebSocket origins**

[attachRelay()](server/web-server.mjs#L1427) accepts `/ws` connections without checking `Origin` or authenticating the caller, then sends a snapshot immediately. The local web interface also lacks an allowed set of `Host` values.

If the browser permits a third-party page to connect to the running endpoint, the server treats that page as a workspace client. The page can receive public workspace data and use the identity weakness in M1 to reach private data. The initial anonymous snapshot alone does not contain every participant's private history. Mixed-content and local-network access rules may block the connection or require permission; reachability depends on the browser and deployment. These prerequisites are why this finding is conditional Major in the home-demo setting.

**Fix:** validate allowed origins and hosts for the launch configuration and authenticate admission before sending application data. Enforce the checks during upgrade/admission, before the existing connection listener sends its snapshot. HTTP CORS settings alone do not validate a WebSocket origin; clients without an Origin header still need authentication.

**M3 — Active attachment content**

The sender controls attachment bytes, filename, and MIME type. [isPdfFile()](src/features/files/fileKind.ts#L11) accepts a PDF filename extension independently of MIME. [SharedFileCard](src/features/files/SharedFileCard.tsx#L38) uses that classification to mount an [iframe without a sandbox](src/features/files/SharedFileCard.tsx#L332). The [media response](server/web-server.mjs#L1144) serves the bytes inline on the application's origin with the stored MIME type. [acceptedSharedFile()](server/web-server.mjs#L197) checks existence and audience but returns message-supplied name/MIME metadata without reconciling it with the stored record.

Consequently, a document presented as a PDF preview can be served as active HTML and execute in the workspace's browser context when opened. Direct navigation to the media URL exposes the same active-document behavior. The Files screen also has a [filename fallback](src/features/files/fileKind.ts#L80): a PDF extension combined with an unrecognized MIME such as `application/xhtml+xml` reaches [PdfPreview](src/features/files/FilePreview.tsx#L249). Live transfers create Blob URLs with the supplied MIME; a Blob URL does not inherently isolate the document from the creator's origin.

The impact is access to application state and actions from browser script running in that origin. This finding does not establish host command execution or arbitrary access to the user's disk.

**Fix:** use canonical server metadata and consistent type classification; isolate document previews with an appropriate sandbox or separate origin; prevent active uploads from being served inline on the application origin. `nosniff` alone does not prevent execution when the response explicitly declares an active content type.

**M4 — Inconsistent file ownership and permissions**

[File creation](server/web-server.mjs#L431) checks duplicate IDs only in folder records, while private chat attachments can exist separately in `workspace.attachments`. [serveMedia()](server/web-server.mjs#L1196) chooses a folder record before an attachment record, and [missing audience metadata](server/web-server.mjs#L146) makes a file public.

A client who knows the ID of a private attachment that has no folder record can create public folder metadata with that same ID. The media handler then authorizes access using the public record while serving the original bytes. A former room participant who already knows the attachment ID satisfies the knowledge prerequisite; guessing arbitrary private IDs is not assumed.

[Upload completion](server/web-server.mjs#L560) also writes bytes before checking whether the file ID already exists. [Chunk acceptance](server/web-server.mjs#L551) and completion do not bind the transfer to its initiating client. Public transfer-start events distribute transfer IDs. Update, rename, move, and delete operations lack consistent audience checks. For attachments, [forgetStoredFile()](server/web-server.mjs#L132) removes folder organization while preserving stored attachment data, so the effect of deletion depends on the record type.

**Fix:** maintain one canonical file record with owner and audience, authorize every operation, enforce ID uniqueness before writing bytes, and bind transfers to verified sessions. Adding a folder reference must preserve the existing file's permissions.

**M5 — Private text broadcast during editing**

[Organizing an attachment](server/web-server.mjs#L604) preserves its audience, so private text can appear in the owner's Files view while remaining absent from an unrelated participant's snapshot. The [editor](src/features/files/FilesScreen.tsx#L687) sends the [complete current body](src/features/files/fileActions.ts#L124) on an edit. [relayFileEvent()](server/web-server.mjs#L1386) restricts transfer events by audience and handles organization separately, but broadcasts ordinary updates to all other open sockets.

An unrelated connected participant therefore receives the private document's text during a legitimate edit. The recipient's UI may ignore the unknown file, but the content has already been transmitted. This path requires neither impersonation nor a custom editing workflow and remains after fixing M1.

**Fix:** derive the recipient set from the canonical file record for every outgoing content or metadata event. Publish the accepted, normalized server result and enforce its audience.

**M6 — Uncontained request and stream errors**

[filePath()](server/web-server.mjs#L992) calls `decodeURIComponent()` on the HTTP path. Invalid percent encoding throws `URIError`, and [handler()](server/web-server.mjs#L1221) does not catch it. Under normal Node behavior, an unhandled exception in this request callback terminates the process, interrupting HTTP and WebSocket service until restart. The path must reach Node; a proxy may reject it first.

[Static-file streaming](server/web-server.mjs#L1002) and [media streaming](server/web-server.mjs#L1144) also pipe `createReadStream()` without handling its error event. An existence/stat check does not guarantee that the later asynchronous open/read succeeds. For example, [file deletion](server/web-server.mjs#L488) can [remove stored bytes](server/web-server.mjs#L118) between the check and open. That asynchronous error is outside a surrounding synchronous try/catch and can terminate Node. This variant requires a read failure or the relevant concurrent ordering. Legacy conversion callbacks also need filesystem-error handling, including around the rename in `succeed()`.

**Fix:** return HTTP 400 for invalid encoding, contain request errors, and handle stream errors and client aborts in both streaming paths. Propagate conversion failures to the request safely. Globally ignoring uncaught exceptions would leave the underlying failures unresolved.

**M7 — Media continues after revocation**

[Room deletion](server/web-server.mjs#L417) removes the call registry entry and broadcasts inactive status. [Membership revocation](server/web-server.mjs#L722) sends room deletion and inactive status to the participant losing access. In `CallProvider`, [inactive handling](src/features/call/CallSession.tsx#L218) invokes [forgetCall()](src/features/call/CallSession.tsx#L131), which clears notices and call bookkeeping without resetting the active `roomId` or ending the call.

[useRoomCall](src/features/call/useRoomCall.web.ts#L354) closes peer connections on leave, WebSocket disconnection, or cleanup, but room/status changes do not terminate the existing links. Rejecting later signaling does not close a direct media connection already established between browsers.

This is reachable through the normal UI: [MembersDialog.remove()](src/features/rooms/RoomDialogs.tsx#L350), its [Remove control](src/features/rooms/RoomDialogs.tsx#L411), and the [membership command](src/features/rooms/RoomsScreen.tsx#L562). Deleting a room or removing a participant during an active or minimized call can therefore leave live media flowing.

**Fix:** end the active call and stop local tracks when the room disappears or access is lost; close connections to revoked participants on the remaining clients; update the server's call participants. The remaining participants must enforce revocation without depending on the removed participant to cooperate.

**M8 — Persisted values break rendering**

[File creation](server/web-server.mjs#L431) accepts arbitrary file fields after limited folder/ID checks, without requiring a string name. The server [persists the record](server/web-server.mjs#L259), clients [apply it from snapshots](src/transport/webSocketTransport.ts#L341), and [Files rendering](src/features/files/FilesScreen.tsx#L514) calls [fileTypeLabel()](src/features/files/fileKind.ts#L32), which assumes `name.lastIndexOf()` exists. A malformed name can therefore break that file list repeatedly after reload.

[Room creation](server/web-server.mjs#L364) similarly requires a truthy ID without enforcing a string. A nonzero numeric ID survives [normalizeRoom()](src/domain/membership.ts#L21) and reaches [roomTone()](src/components/ConversationNav.tsx#L222), which iterates the ID with `for...of`. This fails for a number. [AppShell](src/components/AppShell.tsx#L72) uses that navigation in desktop chat/call views, making the impact broader than one room's message list.

The common failure is durable network data reaching rendering code that relies on TypeScript types without runtime validation. Reloading reloads the invalid record. The file variant affects the relevant list; the room variant affects desktop conversation navigation. Neither establishes Node process termination from that value alone.

**Fix:** validate event schemas and loaded state; construct normalized records; isolate malformed records on the client. Repair existing invalid records individually rather than resetting all user data.

**M9 — Failed writes destroy the recoverable state**

[writeWorkspace()](server/web-server.mjs#L259) overwrites the sole `workspace.json` with a truncating write. A failure or interruption after truncation can leave empty or partial JSON. The [scheduled callback](server/web-server.mjs#L253) does not handle write failures. [Directory persistence](server/web-server.mjs#L1280) uses the same direct-overwrite pattern.

On restart, [loadPersisted()](server/web-server.mjs#L272) logs a read/parse failure and continues with seed state. A later successful save can overwrite the damaged file with seed data and new activity, losing the former room/DM history and file metadata from the application's state. Physical media files may remain on disk.

A nearly full home-server disk, an I/O failure, or interruption during a write can trigger this sequence. [Incoming media](server/web-server.mjs#L560) shares the filesystem and has no overall disk budget. The finding is conditional on the write failure and recovery sequence; exact failure timing depends on the filesystem.

**Fix:** write a temporary file on the same filesystem, preserve the last valid state, handle errors, and atomically replace the state file after a successful write. Keep unreadable existing state protected and enter recovery/read-only mode until it is resolved. Reserve storage or enforce a modest upload budget.

**m1 — Forged server snapshots**

The [fallback relay](server/web-server.mjs#L1490) forwards client messages on unknown topics to other sockets. The browser accepts [snapshot messages](src/transport/webSocketTransport.ts#L413) and [replaces local state](src/transport/webSocketTransport.ts#L320); presence messages can also [replace the roster](src/transport/applyEnvelope.ts#L79). [relayFileEvent()](server/web-server.mjs#L1386) forwards most non-transfer events without an explicit accepted-result contract, allowing a client-supplied files/snapshot event to reach the snapshot consumer.

The result is forged visible state and hidden or replaced lists. This path alone does not overwrite server history; a legitimate snapshot on reconnect restores the authoritative state. Active-content consequences belong to M3. The browser [ignores binary messages](src/transport/webSocketTransport.ts#L644), so this finding concerns accepted text messages.

**Fix:** allow only defined client commands, reject server-only message types at ingress, and generate outbound events from accepted server operations. A browser-side topic check cannot establish server provenance while the relay forwards client-supplied messages with that topic.

**m2 — Resource accumulation without budgets**

The sender [reads the whole file](src/features/files/transferBytes.web.ts#L21) and [sends chunks](src/features/files/transferBytes.web.ts#L68) without waiting for the network queue to drain. The [server](server/web-server.mjs#L551) and [recipients](src/transport/webSocketTransport.ts#L280) accumulate chunks. There are no overall byte/concurrency budgets or complete chunk-index/count checks. The 64 MiB WebSocket `maxPayload` limits one message, while [preview limits](src/features/files/fileKind.ts#L57) act after transfer.

Message bodies and names also lack application-level length limits beyond the transport cap. Growing history is synchronously rewritten in full, new connections receive complete visible snapshots, and recipient send queues are unbounded. Slow clients and large legitimate transfers can therefore increase memory and CPU pressure on a small home server.

[abandonTransfers()](server/web-server.mjs#L821) removes transfer records but leaves `transferAudience` entries; those entries are normally removed only at file-end. Interrupted transfers can retain that bookkeeping for the process lifetime. Cleanup also relies on the supplied transfer identity.

These resource problems are Minor for the small trusted demo. The amount needed to freeze or exhaust a particular machine was not measured; an untrusted or public deployment would require a higher assessment.

**Fix:** enforce byte, concurrency, and field-size limits; validate integer, nonnegative, bounded chunk indices/counts; expire and fully clean up abandoned transfers; stream data and bound send queues with backpressure. Bind cleanup to the verified initiating session and include a disk budget.

**m3 — Device capture without a valid call destination**

[CallScreen](src/features/call/CallScreen.tsx#L23) schedules `startCall(requested)` before establishing that the destination exists and is accessible. [startCall()](src/features/call/CallSession.tsx#L232) validates only a nonempty ID, activates the hook, and initiates [audio/video acquisition](src/features/call/useRoomCall.web.ts#L221). For an invalid destination, the screen displays the room picker while [MiniCall](src/features/call/CallSession.tsx#L329) is suppressed on the call route.

A stale or invalid call link can therefore request or acquire camera/microphone access while ordinary call controls are absent. With existing permission, capture may begin without another prompt. Browser permission and secure-context requirements still apply. The server rejects signaling for an invalid or inaccessible room, so this path establishes a local capture/UI mismatch, not media delivery to an unauthorized participant.

**Fix:** resolve and authorize the destination before activating devices, keep the hook inactive for invalid destinations, provide a visible cancel/leave action during startup and failure, and release media when the destination becomes invalid.

**m4 — Attachment retention after room deletion**

[Deleting a room](server/web-server.mjs#L417) removes the room and call records while leaving its attachment metadata and media. [Workspace saves](server/web-server.mjs#L259) continue to include `workspace.attachments`, including stored text bodies. [Audience checks](server/web-server.mjs#L146) reject normal access when the referenced room no longer exists; organized folder entries can retain that unusable audience too.

The result is indefinite storage use and retained data that ordinary application actions can no longer reach through the deleted room. This alone does not disclose the data to another client. It is a lifecycle problem distinct from M9's failed-write recovery behavior.

**Fix:** define room-deletion retention semantics and remove attachment metadata and bytes once no valid room, message, or folder reference remains. Preserve files that still have valid references. Removing only folder placement can legitimately preserve a chat attachment, as [forgetStoredFile()](server/web-server.mjs#L132) currently does.
