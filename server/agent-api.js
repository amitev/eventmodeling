import { randomInt, randomUUID } from 'node:crypto';
import express from 'express';
import { HttpError } from './http-error.js';

const COMPOSER_NAMES = ['Mozart', 'Haydn', 'Schubert', 'Strauss', 'Bruckner', 'Mahler'];

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
    let name;
    if (req.query.name !== undefined) {
      if (typeof req.query.name !== 'string' || !req.query.name.trim()) {
        throw new HttpError(400, 'Agent name must be non-blank text');
      }
      name = req.query.name.trim();
    }
    const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
    if (!model) throw new HttpError(400, 'Agent model is required');
    const agentType = req.query.agentType;
    if (!['modeler', 'builder'].includes(agentType)) {
      throw new HttpError(400, 'Agent type must be modeler or builder');
    }
    const harness = req.query.harness ?? 'claude';
    if (!['claude', 'copilot'].includes(harness)) throw new HttpError(400, 'Harness must be claude or copilot');

    const usedNames = new Set([...sessions.values()].map((session) => session.name.toLowerCase()));
    if (name === undefined) {
      const available = COMPOSER_NAMES.filter((candidate) => !usedNames.has(candidate.toLowerCase()));
      if (!available.length) throw new HttpError(409, 'All composer names are in use. Provide --name with a unique name.');
      name = available[randomInt(available.length)];
    } else if (usedNames.has(name.toLowerCase())) {
      throw new HttpError(409, `Agent name "${name}" is already in use`);
    }

    const id = randomUUID();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const session = { name, model, agentType, harness, res, lastPing: null, nonce: null };
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
    const agents = [...sessions].map(([id, { name, model, agentType, harness, lastPing }]) =>
      ({ id, name, model, agentType, harness, lastPing }));
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

  router.post('/agents/:id/run', (req, res) => {
    const { res: stream } = liveSession(req.params.id);
    if (stream.writableNeedDrain) throw new HttpError(503, 'Agent stream is busy. Try again.');
    stream.write('event: run\ndata: {}\n\n');
    res.status(202).end();
  });

  router.delete('/agents/:id', (req, res) => {
    const session = liveSession(req.params.id);
    sessions.delete(req.params.id);
    session.res.end('event: stop\ndata: {}\n\n');
    res.status(204).end();
  });

  return router;
}
