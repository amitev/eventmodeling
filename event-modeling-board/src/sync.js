import { serialize, parseBoard } from './io.js';

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('the server cannot be reached');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `server answered ${res.status}`);
  return data;
}

// Writes the Contexts, then every Chapter, one request each, then removes the stored Chapters
// that are no longer on the board (R10.1). Returns the number of Chapters.
export async function pushBoard(nodes, edges, contexts) {
  const { chapters, contexts: list } = serialize(nodes, edges, contexts);
  await request('PUT', '/api/model/contexts', { contexts: list });
  for (const chapter of chapters) {
    await request('PUT', `/api/model/chapters/${encodeURIComponent(chapter.id)}`, chapter);
  }
  await request('POST', '/api/model/prune', { chapterIds: chapters.map((c) => c.id) });
  return chapters.length;
}

// Reads the stored Chapters and rebuilds the board from them with the import checks (R10.2).
export async function pullBoard() {
  return parseBoard(JSON.stringify(await request('GET', '/api/model')));
}
