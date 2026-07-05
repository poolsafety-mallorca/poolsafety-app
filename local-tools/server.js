/* ==========================================================================
   PoolSafety · Mini servidor local
   Uso:  node server.js
   Después: en el móvil (misma WiFi) abrir http://<IP-DEL-PC>:8080
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.md':   'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  // Evita path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1 style="font-family:system-ui">404</h1><p>${urlPath} no existe.</p><p><a href="/">Volver al inicio</a></p>`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ iface: name, address: net.address });
      }
    }
  }
  return ips;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\n  ╭──────────────────────────────────────────╮');
  console.log('  │  PoolSafety · servidor local activo       │');
  console.log('  ╰──────────────────────────────────────────╯');
  console.log('\n  En este ordenador:');
  console.log(`     → http://localhost:${PORT}`);
  console.log('\n  En el móvil (misma red WiFi):');
  if (ips.length === 0) {
    console.log('     (no se detectó IP de red — revisa tu WiFi)');
  } else {
    ips.forEach(ip => console.log(`     → http://${ip.address}:${PORT}    (${ip.iface})`));
  }
  console.log('\n  Ctrl+C para detener el servidor.\n');
});
