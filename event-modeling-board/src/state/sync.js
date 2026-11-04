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

// Writes the Contexts, which removes the stored Contexts no longer on the board, then every Context
// with its Chapters, one request each (R10.1). Returns the number of Chapters.
export async function pushBoard(nodes, edges, contexts) {
  const { chapters, contexts: list } = serialize(nodes, edges, contexts);
  await request('PUT', '/api/model/contexts', { contexts: list });
  for (const context of list) {
    await request('PUT', `/api/model/contexts/${encodeURIComponent(context.id)}`, {
      ...context,
      chapters: chapters.filter((c) => c.context === context.id),
    });
  }
  return chapters.length;
}

// Reads the stored Chapters and rebuilds the board from them with the import checks (R10.2).
export async function pullBoard() {
  return parseBoard(JSON.stringify(await request('GET', '/api/model')));
}
