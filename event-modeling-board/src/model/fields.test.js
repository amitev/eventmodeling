import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inheritOnConnect,
  parentFieldConflicts,
  parentFields,
  propagateFields,
  removeInheritedFieldsFromElements,
} from './fields.js';

const node = (id, kind, fields = []) => ({
  id,
  type: 'sticky',
  data: { kind, fields },
});
const edge = (source, target) => ({ source, target });

test('arrow copies, Propagate and Get from parent record source paths', () => {
  const fields = [{ name: 'profile', type: 'object', fields: [{ name: 'email' }] }];
  const nodes = [
    node('source', 'event', fields),
    node('target', 'read_model'),
    node('later', 'command'),
  ];

  const arrowCopy = inheritOnConnect(nodes, [edge('source', 'target')], [['source', 'target']]);
  assert.deepEqual(arrowCopy[1].data.fields[0].inheritedFrom, {
    elementId: 'source',
    id: arrowCopy[0].data.fields[0].id,
    fieldPath: ['profile'],
  });
  assert.deepEqual(arrowCopy[1].data.fields[0].fields[0].inheritedFrom, {
    elementId: 'source',
    id: arrowCopy[0].data.fields[0].fields[0].id,
    fieldPath: ['profile', 'email'],
  });

  const propagated = propagateFields(nodes, [edge('source', 'target'), edge('target', 'later')], 'source', fields);
  assert.equal(propagated[2].data.fields[0].inheritedFrom.elementId, 'source');

  const parents = parentFields(nodes, [edge('source', 'target')], 'target');
  assert.equal(parents[0].inheritedFrom.elementId, 'source');
});

test('deleting a field source removes its tracked fields but keeps manual fields', () => {
  const nodes = [
    node('source', 'event', [{ name: 'tracked' }]),
    node('target', 'read_model', [{ name: 'manual' }]),
    node('dependent', 'screen'),
  ];
  const firstCopy = inheritOnConnect(nodes, [edge('source', 'target')], [['source', 'target']]);
  const copied = inheritOnConnect(
    firstCopy,
    [edge('source', 'target'), edge('target', 'dependent')],
    [['target', 'dependent']]
  ).map((current) => current.id === 'source'
    ? { ...current, data: { ...current.data, fields: [] } }
    : current);
  const afterDelete = removeInheritedFieldsFromElements(copied, ['source']);

  assert.deepEqual(afterDelete[1].data.fields.map((field) => field.name), ['manual']);
  assert.deepEqual(afterDelete[2].data.fields.map((field) => field.name), ['manual']);
});

test('same-name fields from multiple parents report the later winner', () => {
  const nodes = [
    node('first', 'event', [{ name: 'value' }]),
    node('second', 'read_model', [{ name: 'value', type: 'integer' }]),
    node('target', 'command'),
  ];
  const edges = [edge('first', 'target'), edge('second', 'target')];

  assert.deepEqual(parentFieldConflicts(nodes, edges, 'target'), [{
    name: 'value',
    sources: [
      { sourceId: 'first', field: nodes[0].data.fields[0] },
      { sourceId: 'second', field: nodes[1].data.fields[0] },
    ],
    winnerId: 'second',
  }]);
});
