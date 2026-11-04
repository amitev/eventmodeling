import fs from 'node:fs/promises';
import path from 'node:path';
import { dump, load } from 'js-yaml';
import { compactHtml } from './html-compact.js';

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

// `contexts` would collide with contexts.yaml (S3.4).
export function contextFileName(name) {
  const base = checkName(name.trim().replace(/ /g, '_').toLowerCase(), 'Context name');
  if (base === path.basename(CONTEXTS_FILE, '.yaml')) {
    throw new HttpError(400, `Context name "${name}" cannot be used as a file name`);
  }
  return `${base}.yaml`;
}

const validSlices = (slices) => Array.isArray(slices) && slices.every((s) => isObject(s) && isText(s.id));

// A stored file name: a plain `.yaml` name that is not contexts.yaml.
const validFile = (v) =>
  isText(v) && !ILLEGAL.test(v) && v.endsWith('.yaml') && v.length > 5 && !sameName(v, CONTEXTS_FILE);

// The Chapter with the HTML of its Screens compacted (S3.10). Slices and elements are not checked further.
function compactScreens(chapter) {
  const element = (el) =>
    isObject(el) && el.type === 'SCREEN' && typeof el.html === 'string' ? { ...el, html: compactHtml(el.html) } : el;
  return {
    ...chapter,
    slices: chapter.slices.map((s) => (Array.isArray(s.elements) ? { ...s, elements: s.elements.map(element) } : s)),
  };
}

const byPosition = (a, b) => {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(a.x) - n(b.x) || n(a.y) - n(b.y) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
};

const yaml = (data) => dump(data, { noRefs: true, lineWidth: -1 });

// The board kept under <root>/.event-modeling/model/:
//   contexts.yaml        the ordered Contexts [{ id, name, file }]
//   <context>.yaml       one Context { id, name, chapters: [Chapter] } as exported, slices inline
// A Context is identified by its id inside the file, so a renamed Context (new `file`) replaces its old file.
// All operations run one at a time.
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

  // Context files: [{ file, path }]
  async #scan() {
    let entries;
    try {
      entries = await fs.readdir(this.#model, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    return entries
      .filter((f) => f.isFile() && f.name.endsWith('.yaml') && !sameName(f.name, CONTEXTS_FILE))
      .map((f) => ({ file: f.name, path: path.join(this.#model, f.name) }));
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

  // A Context file, or null when it cannot be read (not strict).
  #readContextFile(file, strict) {
    return this.#read(file, strict, (doc) => {
      if (!isObject(doc) || !isText(doc.id) || !isText(doc.name)) throw new Error('needs context id and name');
      if (!Array.isArray(doc.chapters) || !doc.chapters.every((c) => isObject(c) && isText(c.id))) {
        throw new Error('chapters must be a list of chapters with an id');
      }
      for (const c of doc.chapters) {
        if (c.context !== doc.id) throw new Error(`chapter "${c.id}" is not of context "${doc.id}"`);
        if (!validSlices(c.slices)) throw new Error('slices must be a list of slices with an id');
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
      if (!list.every((c) => isObject(c) && isText(c.id) && isText(c.name) && validFile(c.file))) {
        throw new Error('every context needs id, name and file');
      }
    });
  }

  async #write(file, text) {
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, text);
    await fs.rename(temp, file);
  }

  // Writes the ordered Contexts, then deletes the files of Contexts no longer listed. A file that
  // cannot be read is left alone.
  async pushContexts(contexts) {
    const valid =
      Array.isArray(contexts) &&
      contexts.length > 0 &&
      contexts.every((c) => isObject(c) && isText(c.id) && isText(c.name)) &&
      new Set(contexts.map((c) => c.id)).size === contexts.length;
    if (!valid) throw new HttpError(400, 'Body must be { contexts: [{ id, name }] }: not empty, unique ids');
    const list = contexts.map((c) => ({ id: c.id, name: c.name, file: contextFileName(c.name) }));
    const files = new Set(list.map((c) => c.file.toLowerCase()));
    if (files.size !== list.length) throw new HttpError(409, 'Two contexts have the same file name');
    const keep = new Set(list.map((c) => c.id));
    return this.#run(async () => {
      await fs.mkdir(this.#model, { recursive: true });
      await this.#write(path.join(this.#model, CONTEXTS_FILE), yaml(list));
      let removed = 0;
      for (const entry of await this.#scan()) {
        const doc = await this.#readContextFile(entry.path, false);
        if (!doc || keep.has(doc.id)) continue;
        await fs.rm(entry.path, { force: true });
        removed++;
      }
      return { count: list.length, removed };
    });
  }

  // Stores a whole Context with its Chapters, slices inline, in one file. The Context must have been
  // pushed (pushContexts) with the same name.
  async pushContext(id, context) {
    if (!isObject(context) || !isText(context.id) || !isText(context.name) || !Array.isArray(context.chapters)) {
      throw new HttpError(400, 'Body must be a context with id, name and chapters');
    }
    if (context.id !== id) throw new HttpError(400, 'context.id does not match the URL');
    const { chapters } = context;
    if (!chapters.every((c) => isObject(c) && isText(c.id) && isText(c.name))) {
      throw new HttpError(400, 'Every chapter needs id and name');
    }
    if (new Set(chapters.map((c) => c.id)).size !== chapters.length) {
      throw new HttpError(400, 'context.chapters must have unique ids');
    }
    for (const c of chapters) {
      if (c.context !== id) throw new HttpError(400, `Chapter "${c.id}" is not of context "${id}"`);
      if (!validSlices(c.slices) || new Set(c.slices.map((s) => s.id)).size !== c.slices.length) {
        throw new HttpError(400, `Chapter "${c.id}": slices must be a list of slices with unique ids`);
      }
    }

    return this.#run(async () => {
      const stored = (await this.#readContexts(false))?.find((c) => c.id === id);
      if (!stored) throw new HttpError(409, `Unknown context "${id}": push the contexts first`);
      if (stored.name !== context.name) {
        throw new HttpError(409, `Context "${id}" is named "${stored.name}": push the contexts first`);
      }
      const fileName = stored.file;
      const target = path.join(this.#model, fileName);
      const stale = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readContextFile(entry.path, false);
        if (!doc) continue;
        const sameFile = sameName(entry.file, fileName);
        if (doc.id === id) {
          if (!sameFile) stale.push(entry.path);
        } else if (sameFile) {
          throw new HttpError(409, `${this.#relative(entry.path)} already holds another context`);
        }
      }
      await fs.mkdir(this.#model, { recursive: true });
      await this.#write(target, yaml({ id, name: context.name, chapters: chapters.map(compactScreens) }));
      for (const old of stale) await fs.rm(old, { force: true });
      return { path: this.#relative(target) };
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
        const doc = await this.#readContextFile(entry.path, true);
        if (!contexts.some((c) => c.id === doc.id)) {
          throw new HttpError(422, `${this.#relative(entry.path)}: context "${doc.id}" is not in ${CONTEXTS_FILE}`);
        }
        chapters.push(...doc.chapters);
      }
      chapters.sort(byPosition);
      return {
        format: 'event-model',
        version: 1,
        contexts: contexts.map(({ id, name }) => ({ id, name })),
        chapters,
      };
    });
  }

  // The Chapters of one Context as multi-document YAML, as stored (S3.11). Only the Context file is read.
  // Without `screenContent` the `html` of every Screen is left out (S3.12).
  async pullContext(contextId, screenContent = true) {
    const withoutHtml = (chapter) => ({
      ...chapter,
      slices: chapter.slices.map((s) =>
        Array.isArray(s.elements)
          ? {
              ...s,
              elements: s.elements.map((el) => {
                if (!isObject(el) || el.type !== 'SCREEN') return el;
                const { html, ...rest } = el;
                return rest;
              }),
            }
          : s,
      ),
    });
    return this.#run(async () => {
      const context = (await this.#readContexts(true))?.find((c) => c.id === contextId);
      if (!context) throw new HttpError(404, `Unknown context "${contextId}"`);
      const entry = (await this.#scan()).find((e) => sameName(e.file, context.file));
      if (!entry) return '';
      const doc = await this.#readContextFile(entry.path, true);
      if (doc.id !== contextId) throw new HttpError(422, `${this.#relative(entry.path)}: holds another context`);
      return [...doc.chapters]
        .sort(byPosition)
        .map((c) => `---\n${yaml(screenContent ? c : withoutHtml(c))}`)
        .join('');
    });
  }

  // The stored Context with its file: { entry, doc }, `doc` null when it has no file (S3.5, S3.13).
  async #contextDoc(contextId) {
    const context = (await this.#readContexts(true))?.find((c) => c.id === contextId);
    if (!context) throw new HttpError(404, `Unknown context "${contextId}"`);
    const entry = (await this.#scan()).find((e) => sameName(e.file, context.file));
    if (!entry) return { entry: null, doc: null };
    const doc = await this.#readContextFile(entry.path, true);
    if (doc.id !== contextId) throw new HttpError(422, `${this.#relative(entry.path)}: holds another context`);
    return { entry, doc };
  }

  // Every Screen of the Context document, with where it is: [{ element, chapter, slice }].
  static #screens(doc) {
    const found = [];
    for (const chapter of doc?.chapters ?? []) {
      for (const slice of chapter.slices) {
        for (const element of Array.isArray(slice.elements) ? slice.elements : []) {
          if (isObject(element) && element.type === 'SCREEN') found.push({ element, chapter, slice });
        }
      }
    }
    return found;
  }

  static #summary({ element, chapter, slice }) {
    return {
      id: element.id,
      name: element.name ?? '',
      chapterId: chapter.id,
      chapterName: chapter.name,
      sliceId: slice.id,
      ...(element.copyOf ? { copyOf: element.copyOf } : {}),
    };
  }

  // The Screens of one Context (S3.13). `name` matches the whole name (a part with `contains`),
  // `chapter` a Chapter id or name, all case-insensitively. No HTML is returned.
  async findScreens(contextId, { name, chapter, contains = false } = {}) {
    const lower = (v) => String(v ?? '').trim().toLowerCase();
    return this.#run(async () => {
      const { doc } = await this.#contextDoc(contextId);
      return ModelStore.#screens(doc)
        .filter((s) => {
          if (chapter !== undefined && lower(chapter) !== lower(s.chapter.id) && lower(chapter) !== lower(s.chapter.name)) {
            return false;
          }
          if (name === undefined) return true;
          return contains ? lower(s.element.name).includes(lower(name)) : lower(s.element.name) === lower(name);
        })
        .map((s) => ({
          ...ModelStore.#summary(s),
          hasHtml: typeof s.element.html === 'string',
          hasUrl: typeof s.element.url === 'string',
        }));
    });
  }

  // One Screen with its `html` or `url` (S3.14). A linked copy shows its original's.
  async getScreen(contextId, screenId) {
    return this.#run(async () => {
      const { doc } = await this.#contextDoc(contextId);
      const screens = ModelStore.#screens(doc);
      const screen = screens.find((s) => s.element.id === screenId);
      if (!screen) throw new HttpError(404, `Unknown screen "${screenId}"`);
      const source = screen.element.copyOf
        ? screens.find((s) => s.element.id === screen.element.copyOf)?.element
        : screen.element;
      const { html, url } = source ?? {};
      return {
        ...ModelStore.#summary(screen),
        ...(typeof html === 'string' ? { html } : {}),
        ...(typeof url === 'string' ? { url } : {}),
      };
    });
  }

  // Replaces the HTML of a Screen (S3.15): compacted (S3.10), and the `url` is dropped (a Screen has
  // `html` or `url`, R3.7). A linked copy is refused: its original holds the HTML.
  async putScreenHtml(contextId, screenId, html) {
    if (typeof html !== 'string' || !html.trim()) throw new HttpError(400, 'Body must be { html: text }, not empty');
    const compact = compactHtml(html);
    return this.#run(async () => {
      const { entry, doc } = await this.#contextDoc(contextId);
      const screen = ModelStore.#screens(doc).find((s) => s.element.id === screenId);
      if (!screen) throw new HttpError(404, `Unknown screen "${screenId}"`);
      const { element } = screen;
      if (element.copyOf) {
        throw new HttpError(409, `Screen "${screenId}" is a linked copy: change its original "${element.copyOf}"`);
      }
      // `html` keeps the place of the field it replaces, else follows `info` or `name` (R6.5).
      const keys = Object.keys(element);
      const at = keys.findIndex((k) => k === 'html' || k === 'url');
      const after = at >= 0 ? at - 1 : Math.max(keys.indexOf('info'), keys.indexOf('name'));
      const next = {};
      keys.forEach((k, i) => {
        if (k !== 'html' && k !== 'url') next[k] = element[k];
        if (i === after) next.html = compact;
      });
      if (!('html' in next)) next.html = compact;
      const slice = screen.slice;
      slice.elements = slice.elements.map((e) => (e === element ? next : e));
      await this.#write(entry.path, yaml(doc));
      return { html: compact };
    });
  }
}
