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
export const chapterFileName = (name) => `${safeName(name, 'Chapter name')}.yaml`;

const byPosition = (a, b) => {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(a.x) - n(b.x) || n(a.y) - n(b.y) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

// The board kept under <root>/.event-modeling/model/: `contexts.yaml` with the ordered Contexts
// `[{ id, name }]` and, per Context, a folder <context>/ with one <chapter name>.yaml per Chapter
// (the Chapter as exported). A Chapter is identified by its id inside the file, so a renamed
// Chapter or one moved to another Context replaces its old file. All operations run one at a time.
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

  // Context folders: [{ dir, chapters: [{ name, file }] }]
  async #scan() {
    let dirs;
    try {
      dirs = await fs.readdir(this.#model, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const result = [];
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const folder = path.join(this.#model, dir.name);
      const files = await fs.readdir(folder, { withFileTypes: true });
      result.push({
        dir: dir.name,
        chapters: files
          .filter((f) => f.isFile() && f.name.endsWith('.yaml'))
          .map((f) => ({ name: f.name, file: path.join(folder, f.name) })),
      });
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

  #readChapter(file, strict) {
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

  // A folder without Chapters is removed.
  async #cleanup() {
    for (const { dir, chapters } of await this.#scan()) {
      if (chapters.length) continue;
      try {
        await fs.rmdir(path.join(this.#model, dir));
      } catch (e) {
        if (e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
      }
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
  async push(id, chapter) {
    if (!isObject(chapter) || !isText(chapter.id) || !isText(chapter.name) || !isText(chapter.context)) {
      throw new HttpError(400, 'Body must be a chapter with id, name and context');
    }
    if (chapter.id !== id) throw new HttpError(400, 'chapter.id does not match the URL');
    const name = chapterFileName(chapter.name);

    return this.#run(async () => {
      const context = (await this.#readContexts(false))?.find((c) => c.id === chapter.context);
      if (!context) throw new HttpError(409, `Unknown context "${chapter.context}": push the contexts first`);
      const dir = contextDirName(context.name);
      const folder = path.join(this.#model, dir);
      const stale = [];
      for (const entry of await this.#scan()) {
        const sameDir = sameName(entry.dir, dir);
        for (const c of entry.chapters) {
          const doc = await this.#readChapter(c.file, false);
          if (!doc) continue;
          const sameFile = sameDir && sameName(c.name, name);
          if (doc.id === id) {
            if (!sameFile) stale.push(c.file);
          } else if (sameFile) {
            throw new HttpError(409, `${this.#relative(c.file)} already holds another chapter`);
          } else if (sameDir && doc.context !== chapter.context) {
            throw new HttpError(409, `Folder ${dir} already holds another context`);
          }
        }
      }
      await fs.mkdir(folder, { recursive: true });
      await this.#write(path.join(folder, name), chapter);
      for (const file of stale) await fs.rm(file, { force: true });
      await this.#cleanup();
      return { path: this.#relative(path.join(folder, name)) };
    });
  }

  // Deletes every Chapter file whose id is not in `chapterIds`, then folders left without
  // Chapters. A file that cannot be read is left alone.
  async prune(chapterIds) {
    if (!Array.isArray(chapterIds) || !chapterIds.every((c) => typeof c === 'string')) {
      throw new HttpError(400, 'Body must be { chapterIds: [text] }');
    }
    const keep = new Set(chapterIds);
    return this.#run(async () => {
      let removed = 0;
      for (const { chapters } of await this.#scan()) {
        for (const c of chapters) {
          const doc = await this.#readChapter(c.file, false);
          if (!doc || keep.has(doc.id)) continue;
          await fs.rm(c.file, { force: true });
          removed++;
        }
      }
      await this.#cleanup();
      return { removed };
    });
  }

  // The stored Contexts and Chapters as an export file (format "event-model"), as the board writes it.
  async pull() {
    return this.#run(async () => {
      const contexts = await this.#readContexts(true);
      if (!contexts) throw new HttpError(404, `No model found in ${DATA_DIR}/model`);
      const chapters = [];
      for (const { chapters: files } of await this.#scan()) {
        for (const c of files) {
          const chapter = await this.#readChapter(c.file, true);
          if (!contexts.some((x) => x.id === chapter.context)) {
            throw new HttpError(422, `${this.#relative(c.file)}: context "${chapter.context}" is not in ${CONTEXTS_FILE}`);
          }
          chapters.push(chapter);
        }
      }
      chapters.sort(byPosition);
      return { format: 'event-model', version: 1, contexts, chapters };
    });
  }
}
