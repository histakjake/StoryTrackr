import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import url from 'node:url';

const root = process.cwd();
const publicDir = resolve(root, 'public');
const port = 3000;

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://localhost:${port}`).pathname;

  let filePath = resolve(publicDir, pathname === '/' ? 'app/index.html' : pathname.slice(1));

  if (!filePath.startsWith(publicDir)) {
    filePath = resolve(publicDir, 'app/index.html');
  }

  try {
    const content = await readFile(filePath);
    const ext = filePath.split('.').pop();

    const mimeTypes = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      png: 'image/png',
      ico: 'image/x-icon',
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    try {
      const fallback = await readFile(resolve(publicDir, 'app/index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fallback);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

server.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
