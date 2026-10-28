import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

export const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// Returns the http.Server (not yet listening) so a WebSocket server can attach to it later.
export function createServer({ publicDir = PUBLIC_DIR } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  return http.createServer(app);
}
