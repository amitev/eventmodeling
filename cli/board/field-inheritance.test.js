import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureFieldIds, syncInheritedFields, trackInheritedFields } from './field-inheritance.js';

test('new field ids avoid existing ids anywhere in the field tree', () => {
  let next = 0;
  const fields = ensureFieldIds([
    { name: 'newField' },
    { name: 'existing', id: 'field-1', type: 'object', fields: [{ name: 'nested', id: 'field-2' }] },
  ], () => `field-${++next}`);

  assert.equal(fields[0].id, 'field-3');
});

test('tracked field copies keep source paths through nested fields and dependents', () => {
  const sourceBefore = ensureFieldIds([
    { name: 'profile', type: 'object', fields: [{ name: 'email' }, { name: 'displayName' }] },
  ], (() => {
    let id = 0;
    return () => `field-${++id}`;
  })());
  const sourceAfter = [{
    ...sourceBefore[0],
    fields: sourceBefore[0].fields.filter((field) => field.name !== 'email'),
  }];
  const sourceCopy = trackInheritedFields(sourceBefore, 'source');
  const dependentCopy = trackInheritedFields(sourceCopy, 'dependent');
  const elements = [
    { id: 'source', fields: sourceAfter },
    { id: 'dependent', fields: [...sourceCopy, { name: 'legacy' }] },
    { id: 'downstream', fields: [...dependentCopy, { name: 'manual' }] },
  ];

  const changed = syncInheritedFields(elements, 'source', sourceBefore, sourceAfter);

  assert.deepEqual(changed.get('dependent').map((field) => field.name), ['profile', 'legacy']);
  assert.deepEqual(changed.get('dependent')[0].fields.map((field) => field.name), ['displayName']);
  assert.deepEqual(changed.get('downstream')[0].fields.map((field) => field.name), ['displayName']);
  assert.deepEqual(changed.get('downstream').map((field) => field.name), ['profile', 'manual']);
});

test('renaming a source field renames matching tracked dependents', () => {
  const previous = ensureFieldIds([{ name: 'oldName' }], () => 'field-id');
  const next = [{ ...previous[0], name: 'newName' }];
  const firstCopy = trackInheritedFields(previous, 'source');
  const secondCopy = trackInheritedFields(firstCopy, 'dependent');
  const elements = [
    { id: 'source', fields: next },
    { id: 'dependent', fields: firstCopy },
    { id: 'downstream', fields: secondCopy },
  ];

  const changed = syncInheritedFields(elements, 'source', previous, next);

  assert.equal(changed.get('dependent')[0].name, 'newName');
  assert.equal(changed.get('downstream')[0].name, 'newName');
  assert.deepEqual(changed.get('downstream')[0].inheritedFrom.fieldPath, ['newName']);
});

test('type changes update tracked fields and object transitions copy nested fields', () => {
  const previous = ensureFieldIds([{ name: 'value' }], () => 'root-id');
  const targetBefore = trackInheritedFields(previous, 'source');
  const sourceObject = ensureFieldIds([{
    ...previous[0],
    type: 'object',
    fields: [{ name: 'child' }],
  }], (() => {
    let id = 0;
    return () => `nested-${++id}`;
  })());
  const toObject = syncInheritedFields([
    { id: 'source', fields: sourceObject },
    { id: 'target', fields: targetBefore },
  ], 'source', previous, sourceObject);

  assert.equal(toObject.get('target')[0].type, 'object');
  assert.deepEqual(toObject.get('target')[0].fields.map((field) => field.name), ['child']);
  assert.deepEqual(toObject.get('target')[0].fields[0].inheritedFrom.fieldPath, ['value', 'child']);

  const sourceString = [{ ...sourceObject[0], type: 'string' }];
  delete sourceString[0].fields;
  const toString = syncInheritedFields([
    { id: 'source', fields: sourceString },
    { id: 'target', fields: toObject.get('target') },
  ], 'source', sourceObject, sourceString);

  assert.equal(toString.get('target')[0].type, 'string');
  assert.equal('fields' in toString.get('target')[0], false);
});

test('all tracked field properties and nested additions follow the source', () => {
  const previous = ensureFieldIds([{
    name: 'profile',
    type: 'object',
    fields: [{ name: 'email' }],
  }], (() => {
    let id = 0;
    return () => `field-${++id}`;
  })());
  const next = [{
    ...previous[0],
    name: 'person',
    list: true,
    identifier: true,
    optional: true,
    generated: true,
    pii: true,
    technical: true,
    fields: [
      { ...previous[0].fields[0], type: 'uuid', optional: true },
      { name: 'phone', id: 'phone-id' },
    ],
  }];
  const changed = syncInheritedFields([
    { id: 'source', fields: next },
    { id: 'target', fields: trackInheritedFields(previous, 'source') },
  ], 'source', previous, next);
  const inherited = changed.get('target')[0];

  assert.equal(inherited.name, 'person');
  assert.equal(inherited.list, true);
  assert.equal(inherited.identifier, true);
  assert.equal(inherited.optional, true);
  assert.equal(inherited.generated, true);
  assert.equal(inherited.pii, true);
  assert.equal(inherited.technical, true);
  assert.deepEqual(inherited.fields.map((field) => field.name), ['email', 'phone']);
  assert.equal(inherited.fields[0].type, 'uuid');
  assert.equal(inherited.fields[0].optional, true);
  assert.deepEqual(inherited.fields[1].inheritedFrom, {
    elementId: 'source',
    id: 'phone-id',
    fieldPath: ['person', 'phone'],
  });
});

test('untracked fields are not removed', () => {
  const previous = ensureFieldIds([{ name: 'oldField' }], () => 'field-id');
  const next = [];
  const elements = [
    { id: 'source', fields: next },
    { id: 'untracked', fields: [{ name: 'oldField' }] },
    { id: 'tracked', fields: trackInheritedFields(previous, 'source') },
  ];

  const changed = syncInheritedFields(elements, 'source', previous, next);

  assert.equal(changed.has('untracked'), false);
  assert.deepEqual(changed.get('tracked'), []);
});
