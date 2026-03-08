const http = require("http");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 18800;
const CLASH_CONTROLLER = "127.0.0.1:59488";
const CLASH_SECRET = "6279dc93-8932-4e37-8b90-e09527fda487";

// --- Helpers ---

function ps(cmd, timeout = 15000) {
  const tmp = path.join(os.tmpdir(), `hc_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  try {
    fs.writeFileSync(tmp, cmd, "utf8");
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`, {
      encoding: "utf8",
      timeout,
    }).trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function jsonReply(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function clashFetch(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CLASH_CONTROLLER.split(":")[0],
      port: parseInt(CLASH_CONTROLLER.split(":")[1]),
      path,
      method,
      headers: {
        Authorization: `Bearer ${CLASH_SECRET}`,
        "Content-Type": "application/json",
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Volume (virtual media keys) ---

const AUDIO_KEY_PS = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class AudioKey {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const byte VK_VOLUME_MUTE = 0xAD;
    public const byte VK_VOLUME_DOWN = 0xAE;
    public const byte VK_VOLUME_UP = 0xAF;
    public static void Press(byte vk) { keybd_event(vk, 0, 0, 0); keybd_event(vk, 0, 2, 0); }
}
'@ -ErrorAction Stop
`;

// In-memory state tracking (synced via key presses)
let volumeState = { level: 0, muted: false };

function getVolume() {
  return { ...volumeState };
}

function setVolume(level) {
  const target = Math.max(0, Math.min(100, level));
  const steps = Math.round(target / 2);
  // If muted, unmute first
  if (volumeState.muted) {
    ps(AUDIO_KEY_PS + `[AudioKey]::Press([AudioKey]::VK_VOLUME_MUTE)`);
    volumeState.muted = false;
  }
  ps(
    AUDIO_KEY_PS +
    `for ($i = 0; $i -lt 50; $i++) { [AudioKey]::Press([AudioKey]::VK_VOLUME_DOWN); Start-Sleep -Milliseconds 30 }; ` +
    `for ($i = 0; $i -lt ${steps}; $i++) { [AudioKey]::Press([AudioKey]::VK_VOLUME_UP); Start-Sleep -Milliseconds 30 }`
  );
  volumeState.level = steps * 2; // actual level after rounding
}

function setMute(mute) {
  // Always send the key press — no in-memory state check, since we can't reliably track system mute state
  ps(AUDIO_KEY_PS + `[AudioKey]::Press([AudioKey]::VK_VOLUME_MUTE)`);
  volumeState.muted = mute;
}

// --- Clash process detection ---

function isClashRunning() {
  try {
    const out = ps("Get-Process 'Clash for Windows' -ErrorAction SilentlyContinue | Select-Object -First 1 Id | Format-List");
    return out.length > 0;
  } catch {
    return false;
  }
}

function findClashExe() {
  try {
    const out = ps(
      "(Get-Process 'Clash for Windows' -ErrorAction SilentlyContinue | Select-Object -First 1).Path"
    );
    if (out) return out;
  } catch {}
  const defaults = [
    process.env.LOCALAPPDATA + "\\Programs\\Clash for Windows\\Clash for Windows.exe",
    "C:\\Program Files\\Clash for Windows\\Clash for Windows.exe",
  ];
  for (const p of defaults) {
    try {
      require("fs").accessSync(p);
      return p;
    } catch {}
  }
  return null;
}

// --- Routes ---

const routes = {};

function route(method, path, handler) {
  routes[`${method} ${path}`] = handler;
}

// Volume
route("GET", "/volume", async (_req, res) => {
  try {
    jsonReply(res, 200, { ok: true, ...getVolume() });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

route("POST", "/volume", async (req, res) => {
  const { level } = await readBody(req);
  if (level === undefined || level < 0 || level > 100) {
    return jsonReply(res, 400, { ok: false, error: "level must be 0-100" });
  }
  try {
    setVolume(level);
    jsonReply(res, 200, { ok: true, level });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

route("POST", "/volume/mute", async (_req, res) => {
  try {
    setMute(true);
    jsonReply(res, 200, { ok: true, muted: true });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

route("POST", "/volume/unmute", async (_req, res) => {
  try {
    setMute(false);
    jsonReply(res, 200, { ok: true, muted: false });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

// Lock screen
route("POST", "/lock", async (_req, res) => {
  try {
    execSync("rundll32.exe user32.dll,LockWorkStation");
    jsonReply(res, 200, { ok: true, action: "locked" });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

// Clash - status
route("GET", "/clash/status", async (_req, res) => {
  try {
    const running = isClashRunning();
    if (!running) return jsonReply(res, 200, { ok: true, running: false });
    const { data } = await clashFetch("/configs");
    jsonReply(res, 200, { ok: true, running: true, mode: data.mode, config: { port: data.port, "socks-port": data["socks-port"], "mixed-port": data["mixed-port"] } });
  } catch (e) {
    jsonReply(res, 200, { ok: true, running: isClashRunning(), error: e.message });
  }
});

// Clash - start
route("POST", "/clash/start", async (_req, res) => {
  if (isClashRunning()) return jsonReply(res, 200, { ok: true, message: "already running" });
  const exe = findClashExe();
  if (!exe) return jsonReply(res, 500, { ok: false, error: "Clash for Windows executable not found" });
  try {
    exec(`"${exe}"`);
    jsonReply(res, 200, { ok: true, message: "starting" });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

// Clash - stop
route("POST", "/clash/stop", async (_req, res) => {
  try {
    ps("Stop-Process -Name 'Clash for Windows' -Force -ErrorAction SilentlyContinue");
    jsonReply(res, 200, { ok: true, message: "stopped" });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

// Clash - mode
route("POST", "/clash/mode", async (req, res) => {
  const { mode } = await readBody(req);
  if (!["rule", "global", "direct"].includes(mode)) {
    return jsonReply(res, 400, { ok: false, error: "mode must be rule, global, or direct" });
  }
  try {
    await clashFetch("/configs", "PATCH", { mode });
    jsonReply(res, 200, { ok: true, mode });
  } catch (e) {
    jsonReply(res, 500, { ok: false, error: e.message });
  }
});

// --- Server ---

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  console.log(`[${new Date().toISOString()}] ${key}`);
  const handler = routes[key];
  if (handler) {
    try {
      await handler(req, res);
    } catch (e) {
      jsonReply(res, 500, { ok: false, error: e.message });
    }
  } else {
    // List all endpoints
    if (req.method === "GET" && url.pathname === "/") {
      const endpoints = Object.keys(routes).map((k) => {
        const [method, path] = k.split(" ");
        return { method, path };
      });
      return jsonReply(res, 200, { ok: true, endpoints });
    }
    jsonReply(res, 404, { ok: false, error: "not found" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Host control API listening on http://0.0.0.0:${PORT}`);
  console.log(`Clash controller: ${CLASH_CONTROLLER}`);
  console.log(`Endpoints: ${Object.keys(routes).length}`);
});
