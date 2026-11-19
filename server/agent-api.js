import { randomUUID } from 'node:crypto';
import express from 'express';
import { HttpError } from './http-error.js';

export function agentApi() {
  const router = express.Router();
  const sessions = new Map();

  function liveSession(id) {
    const session = sessions.get(id);
    if (!session || session.res.destroyed || session.res.writableEnded) {
      throw new HttpError(404, 'CLI disconnected');
    }
    return session;
  }

  router.head('/agent/events', (req, res) => res.set('Allow', 'GET').sendStatus(405));
  router.get('/agent/events', (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) throw new HttpError(400, 'Agent name is required');
    const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    if (!model) throw new HttpError(400, 'Agent model is required');

    const id = randomUUID();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const session = { name, model, res, lastPing: null, nonce: null };
    const ping = () => {
      if (res.writableNeedDrain) return;
      session.nonce = randomUUID();
      res.write(`event: ping\ndata: ${JSON.stringify({ id, nonce: session.nonce })}\n\n`);
    };
    const beat = setInterval(ping, 30000);
    res.once('close', () => {
      clearInterval(beat);
      sessions.delete(id);
    });
    sessions.set(id, session);
    res.flushHeaders();
    ping();
  });

  router.get('/agents', (req, res) => {
    const agents = [...sessions].map(([id, { name, model, lastPing }]) => ({ id, name, model, lastPing }));
    res.set('Cache-Control', 'no-store').json(agents);
  });

  router.post('/agents/:id/ping', (req, res) => {
    const session = liveSession(req.params.id);
    if (!session.nonce || req.body?.nonce !== session.nonce) {
      throw new HttpError(400, 'Invalid or expired heartbeat');
    }
    session.nonce = null;
    session.lastPing = Date.now();
    res.status(204).end();
  });

  router.delete('/agents/:id', (req, res) => {
    const session = liveSession(req.params.id);
    sessions.delete(req.params.id);
    session.res.end('event: stop\ndata: {}\n\n');
    res.status(204).end();
  });

  return router;
}
