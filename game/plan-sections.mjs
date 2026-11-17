// Parse only the plan's disclosure structure. Everything else remains text
// for the canvas renderer, including HTML-looking examples in code fences.

// The Markdown producer escapes agent-written text. Decode once, as text,
// after recognizing our formatting: escaped tags must never become markup.
export function formatPlanText(source) {
  let text = source.trim();
  const strike = /^(?:<s>[\s\S]*<\/s>|~~[\s\S]*~~)$/.test(text);
  if (strike) text = text.startsWith('<s>') ? text.slice(3, -4) : text.slice(2, -2);
  text = text.split(/(`[^`]+`)/).map(part => part.startsWith('`') ? part.slice(1, -1) :
    part.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)_([^_\n]+)_(?=$|\s)/g, '$1$2')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')).join('');
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  text = text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => entities[name]);
  return { text, strike };
}

export function parseSections(source) {
  const root = { children: [] }, stack = [root];
  let fence = null, summary = null;
  const append = line => {
    const children = stack.at(-1).children;
    if (children.at(-1)?.type === 'text') children.at(-1).lines.push(line);
    else children.push({ type: 'text', lines: [line] });
  };
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    const marker = text.match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      append(line); continue;
    }
    if (fence) { append(line); continue; }
    if (summary) {
      const end = text.indexOf('</summary>');
      summary.parts.push(end < 0 ? text : text.slice(0, end));
      if (end >= 0) { summary.node.title = summary.parts.join(' ').trim(); summary = null; }
      continue;
    }
    const details = text.match(/^<details(?:\s+([^>]*))?>\s*$/i);
    if (details) {
      const node = { type: 'details', title: 'Details', defaultOpen: /(?:^|\s)open(?:\s|=|$)/i.test(details[1] || ''), children: [] };
      stack.at(-1).children.push(node); stack.push(node); continue;
    }
    if (/^<\/details\s*>$/i.test(text) && stack.length > 1) { stack.pop(); continue; }
    if (text.startsWith('<summary>') && stack.length > 1) {
      const value = text.slice(9), end = value.indexOf('</summary>');
      if (end >= 0) stack.at(-1).title = value.slice(0, end).trim();
      else summary = { node: stack.at(-1), parts: [value] };
      continue;
    }
    append(line);
  }
  function identify(parent, prefix = '') {
    const counts = new Map(); let section = '';
    for (const node of parent.children) {
      if (node.type === 'text') {
        for (const line of node.lines) {
          const heading = line.match(/^##\s+(.+?)\s*$/);
          if (heading) section = heading[1];
        }
      }
      if (node.type !== 'details') continue;
      // Bid titles/statuses can change while a reader has them open. The
      // bid id remains stable. Goals keep their full text when their icon or
      // shortened summary changes; generic sections use their title.
      const body = node.children.filter(c => c.type === 'text').flatMap(c => c.lines).join('\n');
      const bid = body.match(/^_?bid\s+(\d+)\b/im);
      const goal = section === 'Goals' && body.trim() ? formatPlanText(body).text : null;
      const identity = goal !== null ? `goal:${goal}` : bid ? `bid:${bid[1]}` : `summary:${node.title}`;
      const occurrence = (counts.get(identity) || 0) + 1;
      counts.set(identity, occurrence);
      node.key = `${prefix}${identity}:${occurrence}`;
      identify(node, node.key + '/');
    }
  }
  identify(root);
  return root.children;
}
