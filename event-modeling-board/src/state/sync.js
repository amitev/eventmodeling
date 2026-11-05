import { serialize, parseBoard } from './io.js';

// The server refused a push because its model changed since the known revision (R10.7).
export class StaleError extends Error {}

// The revision (SERVER.md S4.1) of a response: its ETag without the quotes.
const revisionOf = (res) => res.headers.get('ETag')?.replace(/^"(.*)"$/, '$1') ?? null;

async function request(method, url, body, revision) {
  const headers = {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(revision == null ? {} : { 'If-Match': `"${revision}"` }),
  };
  let res;
  try {
    res = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    throw new Error('the server cannot be reached');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 412) throw new StaleError(data.error);
  if (!res.ok) throw new Error(data.error ?? `server answered ${res.status}`);
  return { data, revision: revisionOf(res) };
}

// Writes the Contexts, which removes the stored Contexts no longer on the board, then every Context
// with its Chapters, one request each, each with the revision the last answer gave (R10.1).
// `revision` is the one the board knows (R10.5). Returns the number of Chapters, the revisions the
// pushes made (R10.6) and the last one.
export async function pushBoard(nodes, edges, contexts, revision) {
  const { chapters, contexts: list } = serialize(nodes, edges, contexts);
  const pushed = [];
  let current = revision;
  const send = async (url, body) => {
    const answer = await request('PUT', url, body, current);
    current = answer.revision;
    pushed.push(current);
  };
  await send('/api/model/contexts', { contexts: list });
  for (const context of list) {
    await send(`/api/model/contexts/${encodeURIComponent(context.id)}`, {
      ...context,
      chapters: chapters.filter((c) => c.context === context.id),
    });
  }
  return { count: chapters.length, pushed, revision: current };
}

// Reads the stored Chapters and rebuilds the board from them with the import checks (R10.2).
export async function pullBoard() {
  const { data, revision } = await request('GET', '/api/model');
  return { board: parseBoard(JSON.stringify(data)), revision };
}

// The server's revision and whether it holds no model yet (R10.7).
export async function serverState() {
  let res;
  try {
    res = await fetch('/api/model');
  } catch {
    throw new Error('the server cannot be reached');
  }
  if (res.ok) return { empty: false, revision: revisionOf(res) };
  if (res.status !== 404) throw new Error(`server answered ${res.status}`);
  const { data } = await request('GET', '/api/model/revision');
  return { empty: true, revision: data.revision };
}

// Calls `onRevision(revision)` whenever the server's model changes (R10.6); the stream reconnects
// by itself and then reports the current revision. Returns how to stop.
export function watchRevision(onRevision) {
  const events = new EventSource('/api/model/events');
  events.onmessage = (e) => onRevision(JSON.parse(e.data).revision);
  return () => events.close();
}
