export const newFieldId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function ensureFieldIds(fields, createId = newFieldId) {
  const reserved = new Set();
  const collect = (list) => {
    for (const field of list) {
      if (field.id) reserved.add(field.id);
      if (field.type === 'object') collect(field.fields ?? []);
    }
  };
  collect(fields);
  const ids = new Set();
  const nextId = () => {
    let id;
    do id = createId();
    while (reserved.has(id) || ids.has(id));
    ids.add(id);
    return id;
  };
  const visit = (list) => list.map((field) => {
    const id = field.id ?? nextId();
    ids.add(id);
    return {
      ...field,
      id,
      ...(field.type === 'object' ? { fields: visit(field.fields ?? []) } : {}),
    };
  });
  return visit(fields);
}

export function trackInheritedFields(fields, elementId, prefix = []) {
  return fields.map((field) => {
    const fieldPath = [...prefix, field.name];
    return {
      ...field,
      inheritedFrom: { elementId, id: field.id, fieldPath },
      ...(field.type === 'object'
        ? { fields: trackInheritedFields(field.fields ?? [], elementId, fieldPath) }
        : {}),
    };
  });
}

function fieldDefinition(field) {
  const definition = { ...field };
  delete definition.inheritedFrom;
  return {
    ...definition,
    ...(field.type === 'object'
      ? { fields: (field.fields ?? []).map(fieldDefinition) }
      : {}),
  };
}

function fieldIdentities(fields, prefix = [], identities = new Map()) {
  for (const field of fields) {
    const fieldPath = [...prefix, field.name];
    if (field.id) {
      identities.set(field.id, {
        field,
        definition: fieldDefinition(field),
        fieldPath,
      });
    }
    if (field.type === 'object') fieldIdentities(field.fields ?? [], fieldPath, identities);
  }
  return identities;
}

function fieldChanges(previous, next) {
  const before = fieldIdentities(previous);
  const after = fieldIdentities(next);
  const deleted = new Set([...before.keys()].filter((id) => !after.has(id)));
  const changed = new Map();
  for (const [id, old] of before) {
    const current = after.get(id);
    if (current && (
      JSON.stringify(old.definition) !== JSON.stringify(current.definition) ||
      JSON.stringify(old.fieldPath) !== JSON.stringify(current.fieldPath)
    )) {
      changed.set(id, current);
    }
  }
  return { deleted, changed, source: after };
}

function updateTrackedFields(fields, sourceId, source) {
  let changed = false;
  const kept = [];
  for (const field of fields) {
    const inherited = field.inheritedFrom;
    if (inherited?.elementId === sourceId) {
      const current = source.source.get(inherited.id);
      if (source.deleted.has(inherited.id) || !current) {
        changed = true;
        continue;
      }
      const updated = trackInheritedFields(
        [current.field],
        sourceId,
        current.fieldPath.slice(0, -1)
      )[0];
      if (JSON.stringify(field) !== JSON.stringify(updated)) {
        changed = true;
        kept.push(updated);
      } else {
        kept.push(field);
      }
      continue;
    }
    if (field.type === 'object') {
      const nested = updateTrackedFields(field.fields ?? [], sourceId, source);
      if (nested.changed) {
        changed = true;
        kept.push({ ...field, fields: nested.fields });
        continue;
      }
    }
    kept.push(field);
  }
  return { fields: changed ? kept : fields, changed };
}

function removeTrackedFields(fields, sourceId) {
  let changed = false;
  const kept = [];
  for (const field of fields) {
    if (field.inheritedFrom?.elementId === sourceId) {
      changed = true;
      continue;
    }
    if (field.type === 'object') {
      const nested = removeTrackedFields(field.fields ?? [], sourceId);
      if (nested.changed) {
        changed = true;
        kept.push({ ...field, fields: nested.fields });
        continue;
      }
    }
    kept.push(field);
  }
  return { fields: changed ? kept : fields, changed };
}

export function syncInheritedFields(elements, sourceId, previous, next) {
  const queue = [{ sourceId, changes: fieldChanges(previous, next) }];
  const changed = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (!current.changes.deleted.size && !current.changes.changed.size) continue;
    for (const element of elements) {
      const before = changed.get(element.id) ?? element.fields ?? [];
      const result = updateTrackedFields(before, current.sourceId, current.changes);
      if (!result.changed) continue;
      changed.set(element.id, result.fields);
      queue.push({
        sourceId: element.id,
        changes: fieldChanges(before, result.fields),
      });
    }
  }
  return changed;
}

export function removeInheritedFields(elements, sourceId) {
  const queue = [{ sourceId, direct: true }];
  const changed = new Map();
  while (queue.length) {
    const current = queue.shift();
    for (const element of elements) {
      const before = changed.get(element.id) ?? element.fields ?? [];
      const result = current.direct
        ? removeTrackedFields(before, current.sourceId)
        : updateTrackedFields(before, current.sourceId, current.changes);
      if (!result.changed) continue;
      changed.set(element.id, result.fields);
      queue.push({
        sourceId: element.id,
        direct: false,
        changes: fieldChanges(before, result.fields),
      });
    }
  }
  return changed;
}

function assignFieldIdAtPath(fields, path, id) {
  const index = fields.findIndex((field) => field.name === path[0]);
  if (index === -1) return fields;
  const field = fields[index];
  if (path.length > 1) {
    if (field.type !== 'object') return fields;
    const existing = field.fields ?? [];
    const nested = assignFieldIdAtPath(existing, path.slice(1), id);
    if (nested === existing) return fields;
    const result = [...fields];
    result[index] = { ...field, fields: nested };
    return result;
  }
  if (field.id) return fields;
  const result = [...fields];
  result[index] = { ...field, id };
  return result;
}

export function persistInheritedFieldIds(elements, fields) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const changed = new Map();
  const visit = (list) => {
    for (const field of list) {
      const source = field.inheritedFrom;
      if (source?.elementId && source.id && source.fieldPath?.length) {
        const element = byId.get(source.elementId);
        if (element) {
          const current = changed.get(element.id) ?? element.fields ?? [];
          const updated = assignFieldIdAtPath(current, source.fieldPath, source.id);
          if (updated !== current) changed.set(element.id, updated);
        }
      }
      if (field.type === 'object') visit(field.fields ?? []);
    }
  };
  visit(fields);
  return changed;
}
