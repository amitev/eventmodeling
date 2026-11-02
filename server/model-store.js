import fs from 'node:fs/promises';
import path from 'node:path';
import { dump, load } from 'js-yaml';

export const DATA_DIR = '.event-modeling';
export const CONTEXTS_FILE = 'contexts.yaml';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// A name that is not valid as a file name on every OS is refused, never changed (S3.4).
function checkName(text, what) {
  const name = text.trim();
  if (!name || ILLEGAL.test(name) || name.endsWith('.') || RESERVED.test(name)) {
    throw new HttpError(400, `${what} "${text}" cannot be used as a file name`);
  }
  return name;
}

export const contextDirName = (name) => checkName(name.trim().replace(/ /g, '_').toLowerCase(), 'Context name');
export function chapterFileName(chapter) {
  if (ILLEGAL.test(chapter.id)) throw new HttpError(400, `Chapter id "${chapter.id}" cannot be used in a file name`);
  return `${checkName(chapter.name, 'Chapter name')} - ${chapter.id.trim()}.yaml`;
}

const byPosition = (a, b) => {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(a.x) - n(b.x) || n(a.y) - n(b.y) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

// The board kept under <root>/.event-modeling/model/:
//   contexts.yaml                              the ordered Contexts [{ id, name }]
//   <context>/<chapter name> - <chapter id>.yaml   one Chapter as exported, its slices inline
// A Chapter is identified by its id inside the file, so a renamed Chapter or one moved to
// another Context replaces its old file. All operations run one at a time.
export class ModelStore {
  #root;
  #model;
  #queue = Promise.resolve();

  constructor(root) {
    this.#root = root;
    this.#model = path.join(root, DATA_DIR, 'model');
  }

  #run(task) {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => {});
    return result;
  }

  #relative(file) {
    return path.relative(this.#root, file).split(path.sep).join('/');
  }

  async #folders(parent) {
    try {
      return (await fs.readdir(parent, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  // Chapter files: [{ ctx, file, path }]
  async #scan() {
    const result = [];
    for (const ctx of await this.#folders(this.#model)) {
      const folder = path.join(this.#model, ctx);
      for (const f of await fs.readdir(folder, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.yaml')) result.push({ ctx, file: f.name, path: path.join(folder, f.name) });
      }
    }
    return result;
  }

  // Strict: a bad file throws 422 naming it. Not strict: a bad file gives null.
  async #read(file, strict, check) {
    try {
      const data = load(await fs.readFile(file, 'utf8'));
      check(data);
      return data;
    } catch (e) {
      if (strict) throw new HttpError(422, `${this.#relative(file)}: ${e.message}`);
      return null;
    }
  }

  // A Chapter file, or null when it cannot be read (not strict).
  #readChapter(file, strict) {
    return this.#read(file, strict, (doc) => {
      if (!isObject(doc) || !isText(doc.id) || !isText(doc.context)) throw new Error('needs chapter id and context');
      if (!Array.isArray(doc.slices) || !doc.slices.every((s) => isObject(s) && isText(s.id))) {
        throw new Error('slices must be a list of slices with an id');
      }
    });
  }

  // The stored Contexts, or null when there are none (or, if not strict, they cannot be read).
  async #readContexts(strict) {
    const file = path.join(this.#model, CONTEXTS_FILE);
    try {
      await fs.access(file);
    } catch {
      return null;
    }
    return this.#read(file, strict, (list) => {
      if (!Array.isArray(list)) throw new Error('must be a list');
      if (!list.every((c) => isObject(c) && isText(c.id) && isText(c.name))) {
        throw new Error('every context needs id and name');
      }
    });
  }

  async #rmdir(folder) {
    try {
      await fs.rmdir(folder);
    } catch (e) {
      if (e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
    }
  }

  // Empty Context folders are removed.
  async #cleanup() {
    for (const ctx of await this.#folders(this.#model)) await this.#rmdir(path.join(this.#model, ctx));
  }

  async #write(file, data) {
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, dump(data, { noRefs: true, lineWidth: -1 }));
    await fs.rename(temp, file);
  }

  async pushContexts(contexts) {
    const valid =
      Array.isArray(contexts) &&
      contexts.length > 0 &&
      contexts.every((c) => isObject(c) && isText(c.id) && isText(c.name)) &&
      new Set(contexts.map((c) => c.id)).size === contexts.length;
    if (!valid) throw new HttpError(400, 'Body must be { contexts: [{ id, name }] }: not empty, unique ids');
    const list = contexts.map((c) => ({ id: c.id, name: c.name }));
    return this.#run(async () => {
      await fs.mkdir(this.#model, { recursive: true });
      await this.#write(path.join(this.#model, CONTEXTS_FILE), list);
      return { count: list.length };
    });
  }

  // Stores a Chapter in the folder of its Context, which must have been pushed (pushContexts).
  // The whole Chapter, slices inline, goes to one file.
  async push(id, chapter) {
    if (!isObject(chapter) || !isText(chapter.id) || !isText(chapter.name) || !isText(chapter.context)) {
      throw new HttpError(400, 'Body must be a chapter with id, name and context');
    }
    if (chapter.id !== id) throw new HttpError(400, 'chapter.id does not match the URL');
    const slices = chapter.slices;
    if (
      !Array.isArray(slices) ||
      !slices.every((s) => isObject(s) && isText(s.id)) ||
      new Set(slices.map((s) => s.id)).size !== slices.length
    ) {
      throw new HttpError(400, 'chapter.slices must be a list of slices with unique ids');
    }
    const fileName = chapterFileName(chapter);

    return this.#run(async () => {
      const context = (await this.#readContexts(false))?.find((c) => c.id === chapter.context);
      if (!context) throw new HttpError(409, `Unknown context "${chapter.context}": push the contexts first`);
      const ctxDir = contextDirName(context.name);
      const target = path.join(this.#model, ctxDir, fileName);
      const stale = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readChapter(entry.path, false);
        if (!doc) continue;
        const sameCtx = sameName(entry.ctx, ctxDir);
        const sameFile = sameCtx && sameName(entry.file, fileName);
        if (doc.id === id) {
          if (!sameFile) stale.push(entry.path);
        } else if (sameFile) {
          throw new HttpError(409, `${this.#relative(entry.path)} already holds another chapter`);
        } else if (sameCtx && doc.context !== chapter.context) {
          throw new HttpError(409, `Folder ${ctxDir} already holds another context`);
        }
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await this.#write(target, chapter);
      for (const old of stale) await fs.rm(old, { force: true });
      await this.#cleanup();
      return { path: this.#relative(target) };
    });
  }

  // Deletes every Chapter whose id is not in `chapterIds`, then empty folders. A file that
  // cannot be read is left alone.
  async prune(chapterIds) {
    if (!Array.isArray(chapterIds) || !chapterIds.every((c) => typeof c === 'string')) {
      throw new HttpError(400, 'Body must be { chapterIds: [text] }');
    }
    const keep = new Set(chapterIds);
    return this.#run(async () => {
      let removed = 0;
      for (const entry of await this.#scan()) {
        const doc = await this.#readChapter(entry.path, false);
        if (!doc || keep.has(doc.id)) continue;
        await fs.rm(entry.path, { force: true });
        removed++;
      }
      await this.#cleanup();
      return { removed };
    });
  }

  // The stored Contexts and Chapters as an export file (format "event-model"), as the board writes
  // it.
  async pull() {
    return this.#run(async () => {
      const contexts = await this.#readContexts(true);
      if (!contexts) throw new HttpError(404, `No model found in ${DATA_DIR}/model`);
      const chapters = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readChapter(entry.path, true);
        if (!contexts.some((c) => c.id === doc.context)) {
          throw new HttpError(422, `${this.#relative(entry.path)}: context "${doc.context}" is not in ${CONTEXTS_FILE}`);
        }
        chapters.push(doc);
      }
      chapters.sort(byPosition);
      return { format: 'event-model', version: 1, contexts, chapters };
    });
  }
}
