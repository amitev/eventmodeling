import express from 'express';

// The board pushes the contexts, then every Context with its Chapters (spec/SERVER.md section 3).
export function modelApi(store) {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));

  router.get('/model', async (req, res) => {
    res.json(await store.pull());
  });
  router.get('/model/contexts/:id', async (req, res) => {
    const { screenContent = 'true' } = req.query;
    if (screenContent !== 'true' && screenContent !== 'false') {
      return res.status(400).json({ error: 'screenContent must be true or false' });
    }
    res.type('application/yaml').send(await store.pullContext(req.params.id, screenContent === 'true'));
  });
  router.put('/model/contexts', async (req, res) => {
    res.json(await store.pushContexts(req.body?.contexts));
  });
  router.put('/model/contexts/:id', async (req, res) => {
    res.json(await store.pushContext(req.params.id, req.body));
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
    res.json(await store.putScreenHtml(req.params.id, req.params.screenId, req.body?.html));
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
