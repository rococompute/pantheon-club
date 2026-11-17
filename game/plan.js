import Phaser from 'phaser';
import { MovieRoom } from '/src/movie/movie.js';
import { parseSections } from 'virtual:pantheon-plan-sections';

const DEPTH = 30000000, SS = 2.25, WIDTH = 264, HEIGHT = 300, TOP = 114;
const FONT = 'Arial, sans-serif';
const ID = [1, 0, 0, 1, 0, 0];
let serial = 0;

// Rasterize only the visible portion of the document; a long plan never
// creates an oversized GPU texture.
function layout(sections, ctx, expanded) {
  const rows = [];
  let paragraph = [], code = false;
  const inline = s => s.split(/(`[^`]+`)/).map(part => part.startsWith('`') ? part.slice(1, -1) :
    part.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)_([^_\n]+)_(?=$|\s)/g, '$1$2')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')).join('');
  function add(text, heading = false, fixed = false, disclosure = null) {
    const font = `${heading ? 'bold 14' : fixed ? '11' : '12'}px ${fixed ? 'monospace' : FONT}`;
    ctx.font = font;
    let line = '';
    for (let word of (fixed ? text : inline(text)).split(/(\s+)/)) {
      if (!fixed && !line) word = word.trimStart();
      if (ctx.measureText(line + word).width <= WIDTH) { line += word; continue; }
      if (line && ctx.measureText(line + word).width > WIDTH) {
        rows.push({ text: line.trimEnd(), font, height: heading ? 21 : 17, heading, disclosure }); line = '';
      }
      if (!fixed) word = word.trimStart();
      if (ctx.measureText(word).width <= WIDTH) { line = word; continue; }
      // Long paths, hashes and code also fit on the paper.
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > WIDTH) {
          rows.push({ text: line, font, height: heading ? 21 : 17, heading, disclosure }); line = '';
        }
        if (line || character.trim() || fixed) line += character;
      }
    }
    rows.push({ text: line, font, height: heading ? 21 : 17, heading, disclosure });
  }
  const flush = () => { if (paragraph.length) { add(paragraph.join(' ')); paragraph = []; } };
  function textLine(line) {
    const text = line.trim();
    if (/^(?:```|~~~)/.test(text)) { flush(); code = !code; return; }
    if (code) { add(line, false, true); return; }
    if (!text) { flush(); rows.push({ height: 8 }); return; }
    const heading = text.match(/^#{1,6}\s+(.+)/);
    if (heading) { flush(); add(heading[1], true); return; }
    if (/^(?:[-*+] |\d+[.)] )/.test(text)) { flush(); add(text.replace(/^[-*+] /, '• ')); return; }
    paragraph.push(text);
  }
  function render(nodes) {
    for (const node of nodes) {
      if (node.type === 'text') { for (const line of node.lines) textLine(line); continue; }
      flush();
      const open = expanded.get(node.key) ?? node.defaultOpen;
      add((open ? '▾ ' : '▸ ') + node.title, true, false, node.key);
      rows.push({ height: 6 });
      if (open) render(node.children);
      flush(); rows.push({ height: 8 });
    }
  }
  render(sections);
  flush();
  const positioned = [], disclosures = []; let y = 0;
  for (const row of rows) {
    if (!row.text && y === 0) continue;
    positioned.push({ ...row, y }); y += row.height;
    if (row.disclosure) {
      const previous = disclosures.at(-1);
      if (previous?.key === row.disclosure) previous.height += row.height;
      else disclosures.push({ key: row.disclosure, y: y - row.height, height: row.height });
    }
  }
  return { rows: positioned, height: y, disclosures };
}

export class PlanPoster {
  constructor(scene) {
    this.scene = scene; this.offset = 0; this.document = { rows: [], height: 0, disclosures: [] }; this.raw = null;
    this.expanded = new Map(); this.sections = [];
    this.isOpen = false; this.disposed = false;
    this.abort = new AbortController();
    this.key = 'club-plan-' + (++serial);
    this.body = document.createElement('canvas');
    this.body.width = Math.ceil(WIDTH * SS); this.body.height = Math.ceil(HEIGHT * SS);
    this.ctx = this.body.getContext('2d');
    scene.textures.addCanvas(this.key, this.body);
    // The native Ski Hill button opens a native catalogue paper sheet.
    this.ready = this.loadPaper();
    this.onKey = event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') this.close();
      else if (event.key === 'ArrowDown') this.scroll(34);
      else if (event.key === 'ArrowUp') this.scroll(-34);
      else if (event.key === 'PageDown') this.scroll(HEIGHT * .85);
      else if (event.key === 'PageUp') this.scroll(-HEIGHT * .85);
      else if (event.key === 'Home') this.scrollTo(0);
      else if (event.key === 'End') this.scrollTo(this.maxOffset);
      else return;
      event.preventDefault();
    };
    scene.input.keyboard.on('keydown', this.onKey);
    this.onWheel = (pointer, _objects, _dx, dy, _dz, event) => {
      if (!this.isOpen || pointer.worldX < 209 || pointer.worldX > 551 || pointer.worldY < 35 || pointer.worldY > 445) return;
      const scale = scene.scale.gameSize.height / scene.scale.displaySize.height / scene.cameras.main.zoom;
      this.scroll(dy * scale); event?.preventDefault();
    };
    scene.input.on('wheel', this.onWheel);
    this.timer = setInterval(() => { if (this.isOpen) this.refresh(); }, 2000);
  }

  async loadPaper() {
    try {
      const movie = await MovieRoom.load('/assets/catalogues/lodge');
      const entry = movie._mainTl.frames[0].find(e => e.id === 6);
      if (!entry) throw new Error('The pinned catalogue paper changed');
      const art = movie.characters['6'], [w, h] = art.size;
      const sheet = document.createElement('canvas');
      sheet.width = Math.ceil(w * SS); sheet.height = Math.ceil(h * SS);
      const matrix = [...ID]; matrix[4] = art.origin[0]; matrix[5] = art.origin[1];
      await movie.renderLayer(entry, sheet, SS, matrix);
      if (this.disposed) return;
      this.scene.textures.addCanvas(this.key + '-paper', sheet);
      const hill = await MovieRoom.load('/assets/movies/mtn');
      for (const [state, id] of [['up', 107], ['over', 108]]) {
        const icon = document.createElement('canvas');
        icon.width = 64 * SS; icon.height = 56 * SS;
        // Original mtn_cat_btn up/over shapes, with a shared padded origin.
        await hill.renderLayer({ id, matrix: ID }, icon, SS, [1, 0, 0, 1, 3, 3]);
        if (this.disposed) return;
        this.scene.textures.addCanvas(this.key + '-icon-' + state, icon);
      }
      this.button = this.scene.add.image(718, 42, this.key + '-icon-up').setDisplaySize(64, 56)
        .setDepth(DEPTH).setInteractive({ useHandCursor: true });
      this.button.on('pointerover', () => this.button.setTexture(this.key + '-icon-over'));
      this.button.on('pointerout', () => this.button.setTexture(this.key + '-icon-up'));
      this.button.on('pointerdown', (_p, _x, _y, e) => { e.stopPropagation(); this.open(); });
    } catch (error) { console.error('[plan poster]', error); }
  }

  control(x, y, label, action, name) {
    const button = this.scene.add.text(x, y, label, { fontFamily: 'Arial', fontSize: '25px', fontStyle: 'bold', color: '#16556d' })
      .setOrigin(.5).setPadding(7).setInteractive({ useHandCursor: true });
    button.name = name;
    button.on('pointerdown', (_p, _x, _y, e) => { e.stopPropagation(); action(); });
    button.on('pointerover', () => button.setColor('#008dcc'));
    button.on('pointerout', () => button.setColor('#16556d'));
    this.sheet.add(button); return button;
  }

  buildReader() {
    const scene = this.scene;
    this.sheet = scene.add.container(0, 0).setDepth(DEPTH + 10);
    const shade = scene.add.rectangle(380, 240, 760, 480, 0x001833, .5).setInteractive();
    shade.on('pointerdown', (_p, _x, _y, e) => { e.stopPropagation(); this.close(); });
    const paper = scene.add.image(380, 240, this.key + '-paper').setDisplaySize(342, 410).setInteractive();
    paper.on('pointerdown', (_p, _x, _y, e) => e.stopPropagation());
    const body = scene.add.image(248, TOP, this.key).setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setInteractive();
    body.on('pointerdown', (pointer, _x, _y, e) => {
      e.stopPropagation();
      const y = pointer.worldY - TOP + this.offset;
      const section = this.document.disclosures.find(d => y >= d.y && y < d.y + d.height);
      if (section) this.toggleSection(section.key);
    });
    this.scrollbar = scene.add.graphics();
    const track = scene.add.zone(525, TOP + HEIGHT / 2, 16, HEIGHT).setInteractive({ useHandCursor: true });
    let grab = 0;
    const seek = pointer => {
      if (this.maxOffset) this.scrollTo((pointer.worldY - TOP - grab) / (HEIGHT - this.thumbHeight) * this.maxOffset);
    };
    track.on('pointerdown', (pointer, _x, _y, e) => {
      e.stopPropagation();
      const top = this.maxOffset ? this.offset / this.maxOffset * (HEIGHT - this.thumbHeight) : 0;
      const y = pointer.worldY - TOP;
      if (y >= top && y <= top + this.thumbHeight) grab = y - top;
      else { grab = this.thumbHeight / 2; seek(pointer); }
    });
    scene.input.setDraggable(track);
    track.on('drag', seek);
    this.sheet.add([shade, paper, body, this.scrollbar, track]);
    this.control(526, 58, '×', () => this.close(), 'Close plan');
  }

  open() {
    if (!this.button || this.disposed) return;
    const scene = this.scene;
    if (scene.mapOpen) scene.toggleMap();
    scene.playerCard?.close(); scene.wardrobe?.close(); scene.catalogue?.close();
    if (!this.sheet) this.buildReader();
    this.isOpen = true; scene._clubPlanOpen = true;
    this.sheet.setVisible(true); this.button.setVisible(false);
    if (this.raw === null) this.message('Loading the market plan…');
    else this.draw();
    this.refresh();
  }

  close() {
    this.isOpen = false; this.scene._clubPlanOpen = false;
    this.sheet?.setVisible(false); this.button?.setVisible(true);
  }

  async refresh() {
    if (this.fetching || this.disposed) return;
    this.fetching = true;
    try {
      const response = await fetch('/plan.md', { signal: this.abort.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? 'The market has not written plan.md yet.' : 'The local plan is unavailable.');
      const raw = await response.text();
      if (raw !== this.raw) {
        this.raw = raw;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.sections = parseSections(raw || 'The market plan is empty.');
        this.relayout();
      }
    } catch (error) {
      if (!this.disposed && this.raw === null) this.message(error.message);
    } finally { this.fetching = false; }
  }

  message(text) { this.document = layout(parseSections(text), this.ctx, this.expanded); this.offset = 0; this.draw(); }

  relayout() {
    this.document = layout(this.sections, this.ctx, this.expanded);
    this.offset = Math.min(this.offset, this.maxOffset);
    this.draw();
  }

  toggleSection(key) {
    const find = nodes => {
      for (const node of nodes) {
        if (node.key === key) return node;
        if (node.children) { const found = find(node.children); if (found) return found; }
      }
    };
    const node = find(this.sections);
    if (!node) return;
    this.expanded.set(key, !(this.expanded.get(key) ?? node.defaultOpen));
    this.relayout();
  }

  get maxOffset() { return Math.max(0, this.document.height - HEIGHT); }
  get thumbHeight() { return Math.min(HEIGHT, Math.max(18, HEIGHT * HEIGHT / this.document.height)); }

  scroll(delta) { this.scrollTo(this.offset + delta); }

  scrollTo(offset) {
    const next = Phaser.Math.Clamp(offset, 0, this.maxOffset);
    if (next === this.offset) return;
    this.offset = next; this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.body.width, this.body.height);
    ctx.scale(SS, SS); ctx.textBaseline = 'top'; ctx.fillStyle = '#143647';
    for (const row of this.document.rows) {
      const y = row.y - this.offset;
      if (row.text && y + row.height > 0 && y < HEIGHT) {
        ctx.font = row.font; ctx.fillStyle = row.disclosure ? '#16556d' : '#143647'; ctx.fillText(row.text, 0, y + 1);
      }
    }
    this.scene.textures.get(this.key).refresh();
    if (this.scrollbar) {
      this.scrollbar.clear();
      if (this.maxOffset) {
        const height = this.thumbHeight;
        const y = TOP + this.offset / this.maxOffset * (HEIGHT - height);
        this.scrollbar.lineStyle(2, 0x16556d, .15).lineBetween(525, TOP, 525, TOP + HEIGHT);
        this.scrollbar.fillStyle(0x16556d, .65).fillRoundedRect(523, y, 4, height, 2);
      }
    }
  }

  destroy() {
    this.disposed = true; this.abort.abort(); clearInterval(this.timer);
    this.scene.input.keyboard.off('keydown', this.onKey);
    this.scene.input.off('wheel', this.onWheel);
    this.close(); this.sheet?.destroy(true); this.button?.destroy();
    this.scene.textures.remove(this.key);
    for (const suffix of ['-paper', '-icon-up', '-icon-over']) {
      if (this.scene.textures.exists(this.key + suffix)) this.scene.textures.remove(this.key + suffix);
    }
  }
}
