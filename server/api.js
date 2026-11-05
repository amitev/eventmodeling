import express from 'express';
import { HttpError } from './http-error.js';
import { execute, findRoute } from './model-edit.js';

const etag = (revision) => `"${revision}"`;

// `If-Match` as the revision it names: `"abc"`, `W/"abc"` or `*`. Undefined without the header.
function ifMatch(req) {
  const header = req.get('if-match');
  return header === undefined ? undefined : header.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
}

// A push needs the revision it was made from (S4.2).
function pushRevision(req) {
  const revision = ifMatch(req);
  if (revision === undefined) throw new HttpError(428, 'If-Match with the revision of the model is required');
  return revision;
}

// The board pushes the contexts, then every Context with its Chapters (spec/SERVER.md section 3). Agents
// edit it in small steps (section 4).
export function modelApi(store) {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));

  router.get('/model', async (req, res) => {
    const { data, revision } = await store.pull();
    res.set('ETag', etag(revision)).json(data);
  });
  router.get('/model/revision', async (req, res) => {
    const revision = await store.revision();
    res.set('ETag', etag(revision)).json({ revision });
  });
  router.get('/model/events', async (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (revision) => res.write(`data: ${JSON.stringify({ revision })}\n\n`);
    const stop = store.subscribe(send);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 30000);
    res.on('close', () => {
      clearInterval(beat);
      stop();
    });
    send(await store.revision());
  });
  router.get('/model/contexts/:id', async (req, res) => {
    const { screenContent = 'true' } = req.query;
    if (screenContent !== 'true' && screenContent !== 'false') {
      return res.status(400).json({ error: 'screenContent must be true or false' });
    }
    res.type('application/yaml').send(await store.pullContext(req.params.id, screenContent === 'true'));
  });
  router.put('/model/contexts', async (req, res) => {
    const { result, revision } = await store.pushContexts(req.body?.contexts, pushRevision(req));
    res.set('ETag', etag(revision)).json(result);
  });
  router.put('/model/contexts/:id', async (req, res) => {
    const { result, revision } = await store.pushContext(req.params.id, req.body, pushRevision(req));
    res.set('ETag', etag(revision)).json(result);
  });
  router.get('/model/contexts/:id/screens', async (req, res) => {
    const { name, chapter, contains = 'false' } = req.query;
    if (contains !== 'true' && contains !== 'false') {
      return res.status(400).json({ error: 'contains must be true or false' });
    }
    if ([name, chapter].some((v) => v !== undefined && typeof v !== 'string')) {
      return res.status(400).json({ error: 'name and chapter must be text' });
    }
    res.json(await store.findScreens(req.params.id, { name, chapter, contains: contains === 'true' }));
  });
  router.get('/model/contexts/:id/screens/:screenId', async (req, res) => {
    res.json(await store.getScreen(req.params.id, req.params.screenId));
  });
  router.put('/model/contexts/:id/screens/:screenId/html', async (req, res) => {
    const { result, revision } = await store.putScreenHtml(req.params.id, req.params.screenId, req.body?.html);
    res.set('ETag', etag(revision)).json(result);
  });

  // The editing API (section 4): the routes of model-edit.js.
  router.use(async (req, res, next) => {
    if (!req.path.startsWith('/model/')) return next();
    const hit = findRoute(req.method, req.path.slice('/model'.length));
    if (!hit) return next();
    if (!hit.route.write) {
      return res.json(await store.read((model) => execute(model, hit, req.query, req.body).body));
    }
    const { result, revision } = await store.edit((model) => execute(model, hit, req.query, req.body), ifMatch(req));
    res.set('ETag', etag(revision)).status(result.status).json(result.body);
  });

  router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status ?? err.statusCode ?? (err.code === 'ENAMETOOLONG' ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  });
  return router;
}
