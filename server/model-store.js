import fs from 'node:fs/promises';
import path from 'node:path';
import { dump, load } from 'js-yaml';

export const DATA_DIR = '.event-modeling';
export const CONTEXTS_FILE = 'contexts.yaml';
export const CHAPTER_FILE = 'chapter.yaml';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// Makes a file or folder name from free text: illegal characters become "_".
function safeName(text, what) {
  const name = text
    .trim()
    .replace(ILLEGAL, '_')
    .replace(/\.+$/, (dots) => '_'.repeat(dots.length));
  if (!name || RESERVED.test(name)) throw new HttpError(400, `${what} "${text}" cannot be used as a file name`);
  return name;
}

export const contextDirName = (name) => safeName(name.toLowerCase().replace(/\s/g, '_'), 'Context name');
export const chapterDirName = (name) => safeName(name, 'Chapter name');
export const sliceFileName = (slice) =>
  `${safeName(`${slice.name.trim()}.${slice.id.trim().replace(ILLEGAL, '_')}`, 'Slice name')}.yaml`;

const byPosition = (a, b) => {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(a.x) - n(b.x) || n(a.y) - n(b.y) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

// The board kept under <root>/.event-modeling/model/:
//   contexts.yaml                              the ordered Contexts [{ id, name }]
//   <context>/<chapter name>/chapter.yaml      the Chapter as exported, `slices` being the slice ids in order
//   <context>/<chapter name>/<slice name>.<slice id>.yaml   one Slice as exported
// A Chapter is identified by its id inside chapter.yaml, so a renamed Chapter or one moved to
// another Context replaces its old folder. All operations run one at a time.
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

  // The yaml files of a Chapter folder other than chapter.yaml, i.e. its Slice files.
  async #sliceFiles(folder) {
    const files = await fs.readdir(folder, { withFileTypes: true });
    return files.filter((f) => f.isFile() && f.name.endsWith('.yaml') && !sameName(f.name, CHAPTER_FILE)).map((f) => f.name);
  }

  // Chapter folders: [{ ctx, dir, path }]
  async #scan() {
    const result = [];
    for (const ctx of await this.#folders(this.#model)) {
      for (const dir of await this.#folders(path.join(this.#model, ctx))) {
        result.push({ ctx, dir, path: path.join(this.#model, ctx, dir) });
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

  // The chapter.yaml of a folder, or null when it is missing (or, if not strict, unreadable).
  async #readChapter(folder, strict) {
    const file = path.join(folder, CHAPTER_FILE);
    try {
      await fs.access(file);
    } catch {
      return null;
    }
    return this.#read(file, strict, (doc) => {
      if (!isObject(doc) || !isText(doc.id) || !isText(doc.context)) throw new Error('needs chapter id and context');
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

  // Removes the yaml files of a Chapter folder, then the folder if nothing else is in it.
  async #removeChapter(folder) {
    for (const name of [...(await this.#sliceFiles(folder)), CHAPTER_FILE]) {
      await fs.rm(path.join(folder, name), { force: true });
    }
    await this.#rmdir(folder);
  }

  async #rmdir(folder) {
    try {
      await fs.rmdir(folder);
    } catch (e) {
      if (e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
    }
  }

  // Empty Chapter and Context folders are removed.
  async #cleanup() {
    for (const ctx of await this.#folders(this.#model)) {
      const folder = path.join(this.#model, ctx);
      for (const dir of await this.#folders(folder)) await this.#rmdir(path.join(folder, dir));
      await this.#rmdir(folder);
    }
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
  // Its slices go to their own files.
  async push(id, chapter) {
    if (!isObject(chapter) || !isText(chapter.id) || !isText(chapter.name) || !isText(chapter.context)) {
      throw new HttpError(400, 'Body must be a chapter with id, name and context');
    }
    if (chapter.id !== id) throw new HttpError(400, 'chapter.id does not match the URL');
    const slices = chapter.slices;
    if (
      !Array.isArray(slices) ||
      !slices.every((s) => isObject(s) && isText(s.id) && isText(s.name)) ||
      new Set(slices.map((s) => s.id)).size !== slices.length
    ) {
      throw new HttpError(400, 'chapter.slices must be a list of slices with unique ids and names');
    }
    const chapterDir = chapterDirName(chapter.name);
    const files = slices.map((slice) => ({ slice, name: sliceFileName(slice) }));
    if (new Set(files.map((f) => f.name.toLowerCase())).size !== files.length) {
      throw new HttpError(409, 'Two slices would get the same file name');
    }

    return this.#run(async () => {
      const context = (await this.#readContexts(false))?.find((c) => c.id === chapter.context);
      if (!context) throw new HttpError(409, `Unknown context "${chapter.context}": push the contexts first`);
      const ctxDir = contextDirName(context.name);
      const folder = path.join(this.#model, ctxDir, chapterDir);
      const stale = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readChapter(entry.path, false);
        if (!doc) continue;
        const sameCtx = sameName(entry.ctx, ctxDir);
        const sameFolder = sameCtx && sameName(entry.dir, chapterDir);
        if (doc.id === id) {
          if (!sameFolder) stale.push(entry.path);
        } else if (sameFolder) {
          throw new HttpError(409, `${this.#relative(entry.path)} already holds another chapter`);
        } else if (sameCtx && doc.context !== chapter.context) {
          throw new HttpError(409, `Folder ${ctxDir} already holds another context`);
        }
      }
      await fs.mkdir(folder, { recursive: true });
      for (const { slice, name } of files) await this.#write(path.join(folder, name), slice);
      await this.#write(path.join(folder, CHAPTER_FILE), { ...chapter, slices: slices.map((s) => s.id) });
      const keep = new Set(files.map((f) => f.name.toLowerCase()));
      for (const name of await this.#sliceFiles(folder)) {
        if (!keep.has(name.toLowerCase())) await fs.rm(path.join(folder, name), { force: true });
      }
      for (const old of stale) await this.#removeChapter(old);
      await this.#cleanup();
      return { path: this.#relative(path.join(folder, CHAPTER_FILE)) };
    });
  }

  // Deletes every Chapter whose id is not in `chapterIds`, then empty folders. A folder whose
  // chapter.yaml cannot be read is left alone.
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
        await this.#removeChapter(entry.path);
        removed++;
      }
      await this.#cleanup();
      return { removed };
    });
  }

  // The stored Contexts and Chapters as an export file (format "event-model"), as the board writes
  // it. Slice files not listed in their chapter.yaml are ignored.
  async pull() {
    return this.#run(async () => {
      const contexts = await this.#readContexts(true);
      if (!contexts) throw new HttpError(404, `No model found in ${DATA_DIR}/model`);
      const chapters = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readChapter(entry.path, true);
        if (!doc) continue;
        const where = this.#relative(path.join(entry.path, CHAPTER_FILE));
        if (!contexts.some((c) => c.id === doc.context)) {
          throw new HttpError(422, `${where}: context "${doc.context}" is not in ${CONTEXTS_FILE}`);
        }
        if (!Array.isArray(doc.slices) || !doc.slices.every(isText)) {
          throw new HttpError(422, `${where}: slices must be a list of slice ids`);
        }
        const byId = new Map();
        for (const name of await this.#sliceFiles(entry.path)) {
          const file = path.join(entry.path, name);
          const slice = await this.#read(file, true, (s) => {
            if (!isObject(s) || !isText(s.id)) throw new Error('needs slice id');
          });
          if (byId.has(slice.id)) throw new HttpError(422, `${this.#relative(file)}: slice id "${slice.id}" is in two files`);
          byId.set(slice.id, slice);
        }
        const slices = doc.slices.map((sliceId) => {
          if (!byId.has(sliceId)) throw new HttpError(422, `${where}: no file for slice "${sliceId}"`);
          return byId.get(sliceId);
        });
        chapters.push({ ...doc, slices });
      }
      chapters.sort(byPosition);
      return { format: 'event-model', version: 1, contexts, chapters };
    });
  }
}
