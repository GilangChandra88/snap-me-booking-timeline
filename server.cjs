/**
 * server.cjs — Local backend untuk pembuatan folder lokal
 * Dijalankan bersamaan dengan Vite: npm run dev:full
 * 
 * Endpoint:
 *   GET  /api/ping              → health check
 *   POST /api/create-folders    → buat sub-folder di beberapa base path
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3456;

// ── Utility: parse JSON body dari request ──────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
  });
}

// ── CORS headers ───────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Kirim JSON response ────────────────────────────────────────────────────
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ── Handler: POST /api/create-folders ──────────────────────────────────────
async function handleCreateFolders(req, res) {
  let body;
  try { body = await readBody(req); }
  catch { return json(res, 400, { error: 'Invalid JSON body' }); }

  const { basePaths, folderName } = body;

  if (!Array.isArray(basePaths) || !folderName) {
    return json(res, 400, { error: 'Wajib ada basePaths (array) dan folderName (string)' });
  }

  const results = [];
  for (const base of basePaths) {
    if (!base || !String(base).trim()) continue;
    const target = path.join(String(base).trim(), String(folderName));
    try {
      if (fs.existsSync(target)) {
        results.push({ path: target, status: 'exists' });
      } else {
        fs.mkdirSync(target, { recursive: true });
        console.log(`✅ Folder dibuat: ${target}`);
        results.push({ path: target, status: 'created' });
      }
    } catch (err) {
      console.error(`❌ Gagal buat folder ${target}:`, err.message);
      results.push({ path: target, status: 'error', message: err.message });
    }
  }

  return json(res, 200, { results });
}

// ── Main HTTP server ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCors(res);

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url?.split('?')[0];

  if (url === '/api/ping' && req.method === 'GET') {
    return json(res, 200, { ok: true, message: 'Snap Me Local Server aktif 🟢' });
  }

  if (url === '/api/create-folders' && req.method === 'POST') {
    return await handleCreateFolders(req, res);
  }

  return json(res, 404, { error: 'Endpoint tidak ditemukan' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🟢 Snap Me Local Server berjalan di http://localhost:${PORT}`);
  console.log(`   Endpoint: POST http://localhost:${PORT}/api/create-folders\n`);
});
