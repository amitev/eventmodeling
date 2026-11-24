import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { dump, load } from 'js-yaml';
import { compactHtml } from './html-compact.js';
import { clearScreenHighlights, extractHighlights, htmlStructure } from './html-highlights.js';
import { HttpError } from './http-error.js';
import { byPosition, canonical, ordered, orderedTask, readModelEventSources, validateModel, validateTasks } from './model-rules.js';

export { HttpError };
export const DATA_DIR = '.em';
export const CONTEXTS_FILE = 'contexts.yaml';

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
  const element = (el) => {
    if (!isObject(el) || el.type !== 'SCREEN' || typeof el.html !== 'string') return el;
    const { html, highlights } = extractHighlights(compactHtml(el.html));
    return { ...el, html, ...(el.highlights === undefined && highlights.length ? { highlights } : {}) };
  };
  return {
    ...chapter,
    slices: chapter.slices.map((s) => (Array.isArray(s.elements) ? { ...s, elements: s.elements.map(element) } : s)),
  };
}

const yaml = (data) => dump(data, { noRefs: true, lineWidth: -1 });

function sliceStates(model) {
  const elements = new Map();
  for (const chapter of model.chapters) {
    for (const slice of chapter.slices) {
      for (const element of slice.elements ?? []) elements.set(element.id, { element, slice, chapter });
    }
  }
  const original = (element) => elements.get(element.copyOf ?? element.id);
  const dependencies = readModelEventSources(elements);
  const states = new Map();
  for (const chapter of model.chapters) {
    const { slices, ...chapterDetails } = chapter;
    const context = model.contexts.find((entry) => entry.id === chapter.context);
    slices.forEach((slice, index) => {
      const { updatedAt, ...content } = slice;
      const references = new Map();
      for (const element of slice.elements ?? []) {
        if (element.copyOf && original(element)) references.set(element.copyOf, original(element));
        if (element.type === 'READ_MODEL') {
          for (const [id, event] of dependencies.get(element.copyOf ?? element.id) ?? []) {
            if (event.slice.id !== slice.id) references.set(id, event);
          }
        }
      }
      states.set(slice.id, {
        updatedAt,
        content: structuredClone({
          slice: content, index, chapter: chapterDetails,
          context: context && { id: context.id, name: context.name, info: context.info },
          references: [...references].sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => ({
            id, element: source.element,
            slice: { id: source.slice.id, name: source.slice.name },
            chapter: { id: source.chapter.id, name: source.chapter.name, context: source.chapter.context },
          })),
        }),
      });
    });
  }
  return states;
}

function updateSliceTimestamps(before, model) {
  const after = sliceStates(model);
  const now = Date.now();
  for (const chapter of model.chapters) {
    for (const slice of chapter.slices) {
      const previous = before.get(slice.id);
      const unchanged = previous && isDeepStrictEqual(previous.content, after.get(slice.id).content);
      const previousTime = Number.isSafeInteger(previous?.updatedAt) && previous.updatedAt >= 0 ? previous.updatedAt : 0;
      slice.updatedAt = unchanged && previousTime > 0 ? previousTime : Math.max(now, previousTime + 1);
      if (!Number.isSafeInteger(slice.updatedAt)) throw new HttpError(400, `Slice "${slice.id}": updatedAt exceeds the safe integer range`);
    }
    chapter.slices = chapter.slices.map((slice) => ordered(slice, ['id', 'name', 'updatedAt']));
  }
}

function checkContextTasks(doc) {
  if (doc.tasks === undefined) return;
  const ids = new Set([doc.id]);
  const reserve = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!isObject(item)) continue;
      ids.add(item.id);
      for (const key of ['lanes', 'slices', 'elements', 'scenarios']) reserve(item[key]);
    }
  };
  reserve(doc.chapters);
  validateTasks(doc.tasks, doc.id, doc.chapters, (id, kind, at) => {
    if (!isText(id)) throw new HttpError(400, `${at}: must be a non-empty text`);
    if (ids.has(id)) throw new HttpError(400, `${at}: duplicate id "${id}"`);
    ids.add(id);
  }, 'tasks');
}

// The board kept under <root>/.em/model/:
//   contexts.yaml        the ordered Contexts [{ id, name, file }]
//   <context>.yaml       one Context { id, name, tasks?, chapters: [Chapter] }, slices inline
// A Context is identified by its id inside the file, so a renamed Context (new `file`) replaces its old file.
// All operations run one at a time.
export class ModelStore {
  #root;
  #model;
  #queue = Promise.resolve();
  #revision = null;
  #listeners = new Set();

  constructor(root) {
    this.#root = root;
    this.#model = path.join(root, DATA_DIR, 'model');
  }

  #run(task) {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => {});
    return result;
  }

  // The revision (S4.1): a hash of the stored files, so it changes with every change of them.
  async #revisionNow() {
    const hash = createHash('sha256');
    let names = [];
    try {
      names = (await fs.readdir(this.#model, { withFileTypes: true })).filter((f) => f.isFile() && f.name.endsWith('.yaml')).map((f) => f.name);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (const name of names.sort()) {
      hash.update(`${name}\0`).update(await fs.readFile(path.join(this.#model, name))).update('\0');
    }
    return hash.digest('hex').slice(0, 16);
  }

  // Runs `task` as a write (S4.2): with `ifMatch` the revision must be the current one. Gives its
  // result and the new revision, which listeners get when it changed (S4.3).
  #mutate(ifMatch, task) {
    return this.#run(async () => {
      if (ifMatch !== undefined && ifMatch !== '*' && ifMatch !== (await this.#revisionNow())) {
        throw new HttpError(412, 'The model changed since this revision: pull it first');
      }
      const result = await task();
      const revision = await this.#revisionNow();
      if (revision !== this.#revision) {
        this.#revision = revision;
        for (const listener of this.#listeners) listener(revision);
      }
      return { result, revision };
    });
  }

  revision() {
    return this.#run(() => this.#revisionNow());
  }

  // `listener(revision)` is called after every change made through this store; returns how to stop.
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // The whole stored model { contexts: [{ id, name }], chapters }, checked as the board checks a pull
  // (R7.4); none stored is an empty model.
  async #loadModel() {
    const stored = await this.#readContexts(true);
    const model = { contexts: (stored ?? []).map(({ id, name, info }) => ({ id, name, ...(info ? { info } : {}) })), chapters: [] };
    for (const entry of await this.#scan()) {
      const doc = await this.#readContextFile(entry.path, true);
      const context = model.contexts.find((c) => c.id === doc.id);
      if (!context) {
        throw new HttpError(422, `${this.#relative(entry.path)}: context "${doc.id}" is not in ${CONTEXTS_FILE}`);
      }
      if (doc.tasks?.length) context.tasks = structuredClone(doc.tasks);
      model.chapters.push(...structuredClone(doc.chapters));
    }
    try {
      validateModel(model);
      canonical(model);
    } catch (e) {
      throw new HttpError(422, `Stored model: ${e.message}`);
    }
    return model;
  }

  // Writes `model` as the stored files (S3.2), only those that change, and removes the files of
  // Contexts that were deleted or renamed (S3.5).
  async #store(model) {
    const list = model.contexts.map((c) => ({ id: c.id, name: c.name, ...(c.info ? { info: c.info } : {}), file: contextFileName(c.name) }));
    if (new Set(list.map((c) => c.file.toLowerCase())).size !== list.length) {
      throw new HttpError(409, 'Two contexts have the same file name');
    }
    await fs.mkdir(this.#model, { recursive: true });
    const put = async (file, content) => {
      const target = path.join(this.#model, file);
      const same = await fs.readFile(target, 'utf8').then((old) => old === content, () => false);
      if (!same) await this.#write(target, content);
    };
    for (const c of list) {
      const tasks = model.contexts.find((context) => context.id === c.id).tasks;
      await put(c.file, yaml({
        id: c.id, name: c.name,
        ...(tasks?.length ? { tasks: tasks.map(orderedTask) } : {}),
        chapters: model.chapters.filter((ch) => ch.context === c.id),
      }));
    }
    await put(CONTEXTS_FILE, yaml(list));
    const keep = new Map(list.map((c) => [c.id, c.file]));
    for (const entry of await this.#scan()) {
      const doc = await this.#readContextFile(entry.path, false);
      if (doc && !(keep.has(doc.id) && sameName(keep.get(doc.id), entry.file))) await fs.rm(entry.path, { force: true });
    }
  }

  // Reads the model for `fn(model)` (S4.8 to S4.11).
  read(fn) {
    return this.#run(async () => fn(await this.#loadModel()));
  }

  // Changes the model with `fn(model)`, which returns the result, and stores it when it is valid
  // (section 4). Gives { result, revision }.
  edit(fn, ifMatch) {
    return this.#mutate(ifMatch, async () => {
      const model = await this.#loadModel();
      const before = sliceStates(model);
      let stamped = false;
      const stamp = () => {
        updateSliceTimestamps(before, model);
        stamped = true;
      };
      const result = fn(model, stamp);
      if (!stamped) stamp();
      try {
        validateModel(model);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
      await this.#store(model);
      return result;
    });
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
      checkContextTasks(doc);
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
  async pushContexts(contexts, ifMatch) {
    const valid =
      Array.isArray(contexts) &&
      contexts.length > 0 &&
      contexts.every((c) => isObject(c) && isText(c.id) && isText(c.name) && (c.info === undefined || isText(c.info))) &&
      new Set(contexts.map((c) => c.id)).size === contexts.length;
    if (!valid) throw new HttpError(400, 'Body must be { contexts: [{ id, name, info? }] }: not empty, unique ids');
    const list = contexts.map((c) => ({ id: c.id, name: c.name, ...(c.info ? { info: c.info } : {}), file: contextFileName(c.name) }));
    const files = new Set(list.map((c) => c.file.toLowerCase()));
    if (files.size !== list.length) throw new HttpError(409, 'Two contexts have the same file name');
    const keep = new Set(list.map((c) => c.id));
    return this.#mutate(ifMatch, async () => {
      const documents = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readContextFile(entry.path, false);
        if (doc) documents.push({ ...entry, doc, text: yaml(doc) });
      }
      const before = sliceStates({
        contexts: (await this.#readContexts(false)) ?? [],
        chapters: documents.flatMap(({ doc }) => doc.chapters),
      });
      const retained = documents.filter(({ doc }) => keep.has(doc.id));
      updateSliceTimestamps(before, { contexts: list, chapters: retained.flatMap(({ doc }) => doc.chapters) });
      await fs.mkdir(this.#model, { recursive: true });
      await this.#write(path.join(this.#model, CONTEXTS_FILE), yaml(list));
      for (const { path: file, doc, text } of retained) {
        if (yaml(doc) !== text) await this.#write(file, yaml(doc));
      }
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
  async pushContext(id, context, ifMatch) {
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
    checkContextTasks(context);

    return this.#mutate(ifMatch, async () => {
      const contexts = (await this.#readContexts(false)) ?? [];
      const stored = contexts.find((c) => c.id === id);
      if (!stored) throw new HttpError(409, `Unknown context "${id}": push the contexts first`);
      if (stored.name !== context.name) {
        throw new HttpError(409, `Context "${id}" is named "${stored.name}": push the contexts first`);
      }
      const fileName = stored.file;
      const target = path.join(this.#model, fileName);
      const stale = [];
      const documents = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readContextFile(entry.path, false);
        if (!doc) continue;
        documents.push({ ...entry, doc, text: yaml(doc) });
        const sameFile = sameName(entry.file, fileName);
        if (doc.id === id) {
          if (!sameFile) stale.push(entry.path);
        } else if (sameFile) {
          throw new HttpError(409, `${this.#relative(entry.path)} already holds another context`);
        }
      }
      const before = sliceStates({ contexts, chapters: documents.flatMap(({ doc }) => doc.chapters) });
      const next = {
        id, name: context.name,
        ...(context.tasks?.length ? { tasks: context.tasks.map(orderedTask) } : {}),
        chapters: chapters.map(compactScreens),
      };
      const others = documents.filter(({ doc }) => doc.id !== id);
      updateSliceTimestamps(before, { contexts, chapters: [...others.flatMap(({ doc }) => doc.chapters), ...next.chapters] });
      await fs.mkdir(this.#model, { recursive: true });
      await this.#write(target, yaml(next));
      for (const { path: file, doc, text } of others) {
        if (yaml(doc) !== text) await this.#write(file, yaml(doc));
      }
      for (const old of stale) await fs.rm(old, { force: true });
      return { path: this.#relative(target) };
    });
  }

  // The stored Contexts and Chapters as an export file (format "event-model"), as the board writes
  // it, with the revision (S4.1) it was read at.
  async pull() {
    return this.#run(async () => {
      const contexts = await this.#readContexts(true);
      if (!contexts) throw new HttpError(404, `No model found in ${DATA_DIR}/model`);
      const taskLists = new Map();
      const chapters = [];
      for (const entry of await this.#scan()) {
        const doc = await this.#readContextFile(entry.path, true);
        if (!contexts.some((c) => c.id === doc.id)) {
          throw new HttpError(422, `${this.#relative(entry.path)}: context "${doc.id}" is not in ${CONTEXTS_FILE}`);
        }
        chapters.push(...doc.chapters);
        if (doc.tasks?.length) taskLists.set(doc.id, doc.tasks.map(orderedTask));
      }
      chapters.sort(byPosition);
      return {
        data: {
          format: 'event-model',
          version: 1,
          contexts: contexts.map(({ id, name, info }) => ({
            id, name, ...(info ? { info } : {}),
            ...(taskLists.has(id) ? { tasks: taskLists.get(id) } : {}),
          })),
          chapters,
        },
        revision: await this.#revisionNow(),
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

  static #summary({ element, chapter, slice }, source = element) {
    return {
      id: element.id,
      name: source.name ?? '',
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
    return this.read((model) => {
      if (!model.contexts.some((context) => context.id === contextId)) throw new HttpError(404, `Unknown context "${contextId}"`);
      const screens = ModelStore.#screens(model);
      const originals = new Map(screens.filter((s) => !s.element.copyOf).map((s) => [s.element.id, s.element]));
      return screens
        .filter((s) => s.chapter.context === contextId)
        .map((s) => ({ ...s, source: s.element.copyOf ? originals.get(s.element.copyOf) : s.element }))
        .filter((s) => {
          if (chapter !== undefined && lower(chapter) !== lower(s.chapter.id) && lower(chapter) !== lower(s.chapter.name)) {
            return false;
          }
          if (name === undefined) return true;
          return contains ? lower(s.source.name).includes(lower(name)) : lower(s.source.name) === lower(name);
        })
        .map((s) => ({
          ...ModelStore.#summary(s, s.source),
          hasHtml: typeof s.source.html === 'string',
          hasUrl: typeof s.source.url === 'string',
        }));
    });
  }

  // Copies share content, not highlights (S3.14).
  async getScreen(contextId, screenId) {
    return this.read((model) => {
      if (!model.contexts.some((context) => context.id === contextId)) throw new HttpError(404, `Unknown context "${contextId}"`);
      const screens = ModelStore.#screens(model);
      const screen = screens.find((s) => s.chapter.context === contextId && s.element.id === screenId);
      if (!screen) throw new HttpError(404, `Unknown screen "${screenId}"`);
      const source = screen.element.copyOf
        ? screens.find((s) => s.element.id === screen.element.copyOf)?.element
        : screen.element;
      const { html, url } = source ?? {};
      const content = typeof html === 'string' ? extractHighlights(html) : null;
      const highlights = screen.element.highlights ?? (!screen.element.copyOf ? content?.highlights : []) ?? [];
      return {
        ...ModelStore.#summary(screen, source),
        ...(content ? { html: content.html } : {}),
        ...(typeof url === 'string' ? { url } : {}),
        ...(highlights.length ? { highlights } : {}),
      };
    });
  }

  // Replaces the HTML of a Screen (S3.15): compacted (S3.10), and the `url` is dropped (a Screen has
  // `html` or `url`, R3.7). A linked copy is refused: its original holds the HTML.
  async putScreenHtml(contextId, screenId, html) {
    if (typeof html !== 'string' || !html.trim()) throw new HttpError(400, 'Body must be { html: text }, not empty');
    const compact = extractHighlights(compactHtml(html)).html;
    return this.edit((model) => {
      if (!model.contexts.some((context) => context.id === contextId)) throw new HttpError(404, `Unknown context "${contextId}"`);
      const screens = ModelStore.#screens(model);
      const screen = screens.find((s) => s.chapter.context === contextId && s.element.id === screenId);
      if (!screen) throw new HttpError(404, `Unknown screen "${screenId}"`);
      const { element } = screen;
      if (element.copyOf) {
        throw new HttpError(409, `Screen "${screenId}" is a linked copy: change its original "${element.copyOf}"`);
      }
      const before = htmlStructure(element.html);
      const legacy = extractHighlights(element.html);
      if (element.highlights === undefined && legacy.highlights.length) element.highlights = legacy.highlights;
      element.html = compact;
      delete element.url;
      const cleared = before !== htmlStructure(compact)
        ? clearScreenHighlights(screens.map((s) => s.element), screenId) : [];
      canonical(model);
      return { html: compact, ...(cleared.length ? { clearedHighlights: cleared } : {}) };
    });
  }
}
