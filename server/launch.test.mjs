import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { WebSocket } from "ws";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 8123;
const dataDir = join(repoRoot, "server", "data-launch-test");
const distIndex = join(repoRoot, "dist", "index.html");

function request({ method = "GET", path = "/", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function connect(cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        Cookie: cookie,
      },
    });
    const messages = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    socket.on("unexpected-response", (_req, response) => reject(new Error(String(response.statusCode))));
    socket.on("open", () => resolve({ socket, messages }));
  });
}

test("a workspace admits only its own host, session, and actor", async () => {
  mkdirSync(dirname(distIndex), { recursive: true });
  if (!existsSync(distIndex)) {
    writeFileSync(distIndex, "<!doctype html><title>NetcoreWorkspace</title>");
  }
  rmSync(dataDir, { recursive: true, force: true });
  const child = spawn(process.execPath, ["server/web-server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DATA_DIR: "server/data-launch-test",
      ALLOWED_HOSTS: "workspace.example",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    const ready = Date.now() + 8000;
    while (!output.includes(`Open http://127.0.0.1:${port}`) && Date.now() < ready) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(output, new RegExp(`Open http://127\\.0\\.0\\.1:${port}`));

    const foreign = await request({ headers: { Host: "evil.example" } });
    assert.equal(foreign.status, 403);
    const tunnel = await request({ headers: { Host: `workspace.example:${port}` } });
    assert.equal(tunnel.status, 200);

    const secretA = "a".repeat(64);
    const secretB = "b".repeat(64);
    const sessionA = await request({
      method: "POST",
      path: "/session",
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ clientId: "device-one", secret: secretA }),
    });
    const sessionB = await request({
      method: "POST",
      path: "/session",
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ clientId: "device-two", secret: secretB }),
    });
    assert.equal(sessionA.status, 204);
    assert.equal(sessionB.status, 204);
    assert.match(String(sessionA.headers["set-cookie"]), /HttpOnly/);
    assert.doesNotMatch(String(sessionA.headers["set-cookie"]), /Secure/);
    assert.match(String(sessionB.headers["set-cookie"]), /Secure/);
    const cookieA = String(sessionA.headers["set-cookie"]).split(";")[0];
    const cookieB = String(sessionB.headers["set-cookie"]).split(";")[0];

    const anon = await new Promise((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Host: `127.0.0.1:${port}`, Origin: `http://127.0.0.1:${port}` },
      });
      socket.on("unexpected-response", (_req, response) => resolve(response.statusCode));
      socket.on("open", () => resolve("open"));
    });
    assert.equal(anon, 401);

    const a = await connect(cookieA);
    const b = await connect(cookieB);
    a.socket.send(JSON.stringify({
      id: "spoof-1",
      topic: "rooms",
      type: "message",
      clientId: "device-two",
      payload: {
        roomId: "general",
        message: {
          id: "spoof-msg",
          author: "Device Two",
          authorId: "device-two",
          body: "pretending",
          time: "1:00 PM",
        },
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const seen = b.messages.filter((item) => item.topic === "rooms" && item.type === "message");
    assert.deepEqual(seen.map((item) => item.payload?.message?.authorId), ["device-one"]);
    a.socket.close();
    b.socket.close();

    const upload = await request({
      method: "POST",
      path: "/upload",
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        Cookie: cookieA,
        "content-type": "application/octet-stream",
        "x-workspace-upload": encodeURIComponent(JSON.stringify({
          fileId: "file-launch-upload",
          name: "clip.mov",
          mimeType: "video/quicktime",
          folderId: "getting-started",
        })),
      },
      body: "mov-bytes",
    });
    assert.equal(upload.status, 201);
    const uploaded = JSON.parse(upload.body);
    assert.equal(uploaded.file.name, "clip.mov");
    assert.equal(uploaded.file.mimeType, "video/quicktime");
    assert.equal(uploaded.file.size, "mov-bytes".length);
    const media = await request({
      path: "/media/file-launch-upload",
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        Cookie: cookieA,
      },
    });
    assert.equal(media.status, 200);
    assert.equal(media.body, "mov-bytes");
    assert.match(String(media.headers["content-type"]), /video\/quicktime/);
    const anonymousUpload = await request({
      method: "POST",
      path: "/upload",
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        "content-type": "application/octet-stream",
        "content-length": "4",
        "x-workspace-upload": encodeURIComponent(JSON.stringify({
          fileId: "file-no-session",
          name: "nope.mov",
          folderId: "getting-started",
        })),
      },
      body: "nope",
    });
    assert.equal(anonymousUpload.status, 401);

    const badPath = await request({ path: "/%", headers: { Host: `127.0.0.1:${port}` } });
    const stillUp = await request({ headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(badPath.status, 400);
    assert.equal(stillUp.status, 200);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
});
