// Dev server for MOD QUEUE: serves ./game and accepts canvas captures at POST /save?name=x
// (dev tooling only — not part of the itch.io build)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "game");
const CAPS = path.join(__dirname, "_caps");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/save") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const name = (url.searchParams.get("name") || "cap").replace(/[^a-z0-9_-]/gi, "");
        const b64 = body.substring(body.indexOf(",") + 1);
        const ext = body.includes("image/png") ? ".png" : ".jpg";
        fs.mkdirSync(CAPS, { recursive: true });
        fs.writeFileSync(path.join(CAPS, name + ext), Buffer.from(b64, "base64"));
        res.writeHead(200); res.end("saved " + name + ext);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    return;
  }
  let p = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(p)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",   // dev: always serve fresh files
      "Pragma": "no-cache"
    });
    res.end(data);
  });
}).listen(8311, () => console.log("modqueue dev server on :8311"));
