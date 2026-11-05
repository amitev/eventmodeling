import { serialize, parseBoard } from './io.js';
import { makeEmptyBoard } from '../model/model.js';

// The server refused a push because its model changed since the known revision (R10.7).
export class StaleError extends Error {}

// The server answered with an error status.
class StatusError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

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
  if (!res.ok) throw new StatusError(data.error ?? `server answered ${res.status}`, res.status);
  return { data, revision: revisionOf(res) };
}

// Writes the Contexts, which removes the stored Contexts no longer on the board, then every Context
// with its Chapters, one request each, each with the revision the last answer gave (R10.1).
// `revision` is the one the board knows (R10.5). Returns the revisions the pushes made (R10.6) and
// the last one. A failure carries the `revision` and `pushed` of the requests that did succeed.
export async function pushBoard(nodes, edges, contexts, revision) {
  const { chapters, contexts: list } = serialize(nodes, edges, contexts);
  const pushed = [];
  let current = revision;
  const send = async (url, body) => {
    const answer = await request('PUT', url, body, current);
    current = answer.revision;
    pushed.push(current);
  };
  try {
    await send('/api/model/contexts', { contexts: list });
    for (const context of list) {
      await send(`/api/model/contexts/${encodeURIComponent(context.id)}`, {
        ...context,
        chapters: chapters.filter((c) => c.context === context.id),
      });
    }
  } catch (err) {
    err.revision = current;
    err.pushed = pushed;
    throw err;
  }
  return { pushed, revision: current };
}

// Reads the stored Chapters and rebuilds the board from them with the import checks (R10.2). A
// server with no model gives the starting board (R1.4).
export async function pullBoard() {
  try {
    const { data, revision } = await request('GET', '/api/model');
    return { board: parseBoard(JSON.stringify(data)), revision };
  } catch (err) {
    if (err.status !== 404) throw err;
    const { data } = await request('GET', '/api/model/revision');
    return { board: makeEmptyBoard(), revision: data.revision };
  }
}

// Calls `onRevision(revision)` whenever the server's model changes (R10.6); the stream reconnects
// by itself and then reports the current revision. Returns how to stop.
export function watchRevision(onRevision) {
  const events = new EventSource('/api/model/events');
  events.onmessage = (e) => onRevision(JSON.parse(e.data).revision);
  return () => events.close();
}
