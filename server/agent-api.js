import { randomUUID } from 'node:crypto';
import express from 'express';
import { HttpError } from './http-error.js';

export function agentApi() {
  const router = express.Router();
  const sessions = new Map();

  router.head('/agent/events', (req, res) => res.set('Allow', 'GET').sendStatus(405));
  router.get('/agent/events', (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) throw new HttpError(400, 'Agent name is required');
    const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    if (!model) throw new HttpError(400, 'Agent model is required');

    const id = randomUUID();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const beat = setInterval(() => {
      if (!res.writableNeedDrain) res.write(': keep-alive\n\n');
    }, 30000);
    res.once('close', () => {
      clearInterval(beat);
      sessions.delete(id);
    });
    sessions.set(id, { name, model, res });
    res.flushHeaders();
  });

  router.get('/agents', (req, res) => {
    res.set('Cache-Control', 'no-store').json([...sessions].map(([id, { name, model }]) => ({ id, name, model })));
  });

  router.post('/agents/:id/messages', (req, res) => {
    if (!req.is('application/json')) throw new HttpError(415, 'Expected application/json');
    const { message } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'Message is required');

    const recipient = sessions.get(req.params.id)?.res;
    if (!recipient || recipient.destroyed) throw new HttpError(404, 'CLI disconnected. Select a recipient again.');
    if (recipient.writableNeedDrain) throw new HttpError(503, 'CLI is busy receiving messages. Try again.');
    recipient.write(`data: ${JSON.stringify({ message })}\n\n`);
    res.status(204).end();
  });

  return router;
}
