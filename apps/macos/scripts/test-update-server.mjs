import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Pass the disposable test fixture feed directory.');
const files = new Map([
  ['/appcast.xml', ['appcast.xml', 'application/rss+xml']],
  ['/test-update.dmg', ['test-update.dmg', 'application/octet-stream']],
]);
createServer((request, response) => {
  const file = files.get(request.url);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404); response.end(); return;
  }
  try {
    const path = resolve(root, file[0]);
    response.writeHead(200, { 'Content-Type': file[1], 'Content-Length': statSync(path).size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).pipe(response);
    console.log(`${request.method} ${file[0]}`);
  } catch { response.writeHead(404); response.end(); }
}).listen(18743, '127.0.0.1', () => console.log('Update test server listening on loopback port 18743'));
