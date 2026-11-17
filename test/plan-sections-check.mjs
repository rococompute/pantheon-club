import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSections } from '../game/plan-sections.mjs';

test('plan disclosures preserve text, nesting and the open attribute', () => {
  const tree = parseSections(['## Plan', '', '<details open>', '<summary>Parent task</summary>',
    'Parent evidence.', '<details>', '<summary>Child task</summary>', 'Child evidence.',
    '</details>', '</details>', 'After the tasks.'].join('\n'));
  assert.equal(tree[0].type, 'text');
  const parent = tree[1];
  assert.equal(parent.title, 'Parent task');
  assert.equal(parent.defaultOpen, true);
  assert.equal(parent.children[0].lines[0], 'Parent evidence.');
  const child = parent.children[1];
  assert.equal(child.defaultOpen, false);
  assert.equal(child.title, 'Child task');
  assert(child.key.startsWith(parent.key + '/'));
  assert.equal(child.children[0].lines[0], 'Child evidence.');
  assert.equal(tree[2].lines[0], 'After the tasks.');
});

test('a bid keeps its disclosure identity when its title/status or surrounding bids change', () => {
  const bid = (id, title) => `<details>\n<summary>${title}</summary>\n_bid ${id} by codex, pending_\nEvidence.\n</details>`;
  const before = parseSections(bid(45, 'Pending task'))[0];
  const after = parseSections(bid(99, 'Newer task') + '\n' + bid(45, 'Completed task'))[1];
  assert.equal(before.key, after.key);
  assert.notEqual(after.key, parseSections(bid(99, 'Newer task'))[0].key);
});

test('disclosure examples in code fences remain literal text', () => {
  for (const fence of ['```html', '~~~html']) {
    const tree = parseSections([fence, '<details>', '<summary>Example only</summary>', '</details>', fence.slice(0, 3)].join('\n'));
    assert.equal(tree.length, 1);
    assert.equal(tree[0].type, 'text');
    assert(tree[0].lines.includes('<summary>Example only</summary>'));
  }
});

test('multiline summaries and repeated titles remain independently expandable', () => {
  const source = '<details>\n<summary>\nA long\ntask title\n</summary>\nOne\n</details>';
  const tree = parseSections(source + '\n' + source);
  assert.equal(tree[0].title, 'A long task title');
  assert.notEqual(tree[0].key, tree[1].key);
});
