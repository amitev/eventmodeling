import express from 'express';

// The board pushes the contexts, then the chapters one at a time, then prunes (spec/SERVER.md section 3).
export function modelApi(store) {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));

  router.get('/model', async (req, res) => {
    res.json(await store.pull());
  });
  router.get('/model/contexts/:id/chapters', async (req, res) => {
    const { screenContent = 'true' } = req.query;
    if (screenContent !== 'true' && screenContent !== 'false') {
      return res.status(400).json({ error: 'screenContent must be true or false' });
    }
    res.type('application/yaml').send(await store.pullContextYaml(req.params.id, screenContent === 'true'));
  });
  router.put('/model/contexts', async (req, res) => {
    res.json(await store.pushContexts(req.body?.contexts));
  });
  router.put('/model/chapters/:id', async (req, res) => {
    res.json(await store.push(req.params.id, req.body));
  });
  router.post('/model/prune', async (req, res) => {
    res.json(await store.prune(req.body?.chapterIds));
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
