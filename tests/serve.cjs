const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!/^\/(?:[\w-]+\.html|logo\.jpg|(?:css|js)\/[\w-]+\.(?:css|js))$/.test(pathname) && pathname !== '/') {
        response.writeHead(404).end();
        return;
    }
    const file = path.resolve(root, `.${pathname === '/' ? '/quotation.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
    }
    try {
        const content = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        response.end(content);
    } catch (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
        if (error.code !== 'ENOENT') console.error(error);
    }
}).listen(8766, '127.0.0.1');
