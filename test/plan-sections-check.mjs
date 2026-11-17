import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseSections, formatPlanText } from '../game/plan-sections.mjs';

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

test('goals keep disclosure choices across status changes, shortened titles and reordering', () => {
  const goal = (title, body) => `<details>\n<summary>${title}</summary>\n\n${body}\n\n</details>`;
  const body = 'Keep the full goal text, including &amp; and &lt;arguments&gt;.';
  const key = status => parseSections('## Goals\n' + goal(status + ' Keep the full…', body))[1].key;
  for (const status of ['🫘', '🌱', '🪴', '🌳']) assert.equal(key(status), key('🫘'));
  const reordered = parseSections('## Market (a new leader)\n## Goals\n' +
    goal('🫘 A new goal', 'A new goal.') + '\n' + goal('🌳 A different short title', body));
  assert.equal(reordered.filter(n => n.type === 'details')[1].key, key('🫘'));
  const dropped = parseSections('## Goals\n' + goal('<s>Dropped goal</s>', `~~${body}~~`))[1];
  assert.equal(dropped.key, key('🫘'));
});

test('canvas text decodes escaped agent content once without turning it into markup', () => {
  assert.deepEqual(formatPlanText('**Review** `a &lt; b` &amp; &lt;script&gt;'),
    { text: 'Review a < b & <script>', strike: false });
  assert.deepEqual(formatPlanText('&amp;lt;s&amp;gt; &quot;quoted&quot;'),
    { text: '&lt;s&gt; "quoted"', strike: false });
  assert.deepEqual(formatPlanText('&lt;s&gt;literal tags&lt;/s&gt;'),
    { text: '<s>literal tags</s>', strike: false });
  for (const text of ['<s>Dropped &amp; deferred</s>', '~~Dropped &amp; deferred~~']) {
    assert.deepEqual(formatPlanText(text), { text: 'Dropped & deferred', strike: true });
  }
});

test('demo matches the Market, Goals and Contributions disclosure format', async () => {
  const source = await readFile(new URL('../game/demo-plan.md', import.meta.url), 'utf8');
  assert(source.startsWith('## Market (codex leader)\n'));
  assert(source.includes('## Goals\n') && source.includes('## Contributions\n'));
  assert(source.includes('_🫘 open  🌱 working  🪴 progressing  🌳 done_'));
  assert(source.includes('_🎫 pending  📈 accepted  📉 rejected  🪦 stale_'));
  assert(!/## (?:Tasks|Bids|Plan:)/.test(source));
  const folds = parseSections(source).filter(n => n.type === 'details');
  assert.equal(folds.length, 10);
  assert.equal(folds[0].title, 'Details');
  assert(folds.every(n => !n.defaultOpen));
  assert.deepEqual(folds.slice(1, 5).map(n => n.title.split(' ')[0]), ['🌳', '🪴', '🌱', '🫘']);
  assert.deepEqual(folds.slice(6).map(n => n.title.split(' ')[0]), ['📈', '🎫', '📉', '🪦']);
});
