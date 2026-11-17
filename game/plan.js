import Phaser from 'phaser';
import { MovieRoom } from '/src/movie/movie.js';

const DEPTH = 30000000, SS = 2.25, WIDTH = 264, HEIGHT = 272;
const FONT = 'Arial, sans-serif';
const ID = [1, 0, 0, 1, 0, 0];
let serial = 0;

// Lay out all of the document as small, fixed-size pages. Only the current
// page is rasterized, so a long plan never creates an oversized GPU texture.
function paginate(source, ctx) {
  const rows = [];
  let paragraph = [], code = false;
  const inline = s => s.split(/(`[^`]+`)/).map(part => part.startsWith('`') ? part.slice(1, -1) :
    part.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)_([^_\n]+)_(?=$|\s)/g, '$1$2')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')).join('');
  function add(text, heading = false, fixed = false) {
    const font = `${heading ? 'bold 14' : fixed ? '11' : '12'}px ${fixed ? 'monospace' : FONT}`;
    ctx.font = font;
    let line = '';
    for (let word of (fixed ? text : inline(text)).split(/(\s+)/)) {
      if (!fixed && !line) word = word.trimStart();
      if (ctx.measureText(line + word).width <= WIDTH) { line += word; continue; }
      if (line && ctx.measureText(line + word).width > WIDTH) {
        rows.push({ text: line.trimEnd(), font, height: heading ? 21 : 17, heading }); line = '';
      }
      if (!fixed) word = word.trimStart();
      if (ctx.measureText(word).width <= WIDTH) { line = word; continue; }
      // Long paths, hashes and code also fit on the paper.
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > WIDTH) {
          rows.push({ text: line, font, height: heading ? 21 : 17, heading }); line = '';
        }
        if (line || character.trim() || fixed) line += character;
      }
    }
    rows.push({ text: line, font, height: heading ? 21 : 17, heading });
  }
  const flush = () => { if (paragraph.length) { add(paragraph.join(' ')); paragraph = []; } };
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (/^```/.test(text)) { flush(); code = !code; continue; }
    if (code) { add(line, false, true); continue; }
    if (!text || /^<\/?details\s*>$/.test(text)) { flush(); rows.push({ height: 8 }); continue; }
    const heading = text.match(/^#{1,6}\s+(.+)/) || text.match(/^<summary>(.*?)<\/summary>$/);
    if (heading) { flush(); add(heading[1], true); continue; }
    if (/^(?:[-*+] |\d+[.)] )/.test(text)) { flush(); add(text.replace(/^[-*+] /, '• ')); continue; }
    paragraph.push(text);
  }
  flush();
  const pages = [[]]; let y = 0;
  for (const [i, row] of rows.entries()) {
    const needed = row.height + (row.heading ? rows[i + 1]?.height || 0 : 0);
    if (y + needed > HEIGHT && pages.at(-1).length) { pages.push([]); y = 0; }
    if (!row.text && y === 0) continue;
    pages.at(-1).push({ ...row, y }); y += row.height;
  }
  return pages;
}

export class PlanPoster {
  constructor(scene) {
    this.scene = scene; this.page = 0; this.pages = [[]]; this.raw = null;
    this.isOpen = false; this.disposed = false;
    this.abort = new AbortController();
    this.key = 'club-plan-' + (++serial);
    this.body = document.createElement('canvas');
    this.body.width = Math.ceil(WIDTH * SS); this.body.height = Math.ceil(HEIGHT * SS);
    this.ctx = this.body.getContext('2d');
    scene.textures.addCanvas(this.key, this.body);
    // A native catalogue sheet, shared by the small poster and reader.
    this.ready = this.loadPaper();
    this.onKey = event => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') this.close();
      else if (['ArrowRight', 'PageDown'].includes(event.key)) this.turn(1);
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) this.turn(-1);
      else return;
      event.preventDefault();
    };
    scene.input.keyboard.on('keydown', this.onKey);
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
      this.button = this.scene.add.image(724, 43, this.key + '-paper').setDisplaySize(48, 58)
        .setDepth(DEPTH).setInteractive({ useHandCursor: true });
      this.label = this.scene.add.text(724, 40, 'PLAN', { fontFamily: 'GoPenguin, Arial', fontSize: '9px', fontStyle: 'bold', color: '#15475c' })
        .setOrigin(.5).setDepth(DEPTH + 1);
      this.button.on('pointerover', () => this.button.setAlpha(.85));
      this.button.on('pointerout', () => this.button.setAlpha(1));
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
    const title = scene.add.text(380, 76, 'PLAN', { fontFamily: 'GoPenguin, Arial', fontSize: '25px', fontStyle: 'bold', color: '#15475c' }).setOrigin(.5);
    const body = scene.add.image(248, 114, this.key).setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.counter = scene.add.text(380, 418, '', { fontFamily: 'Arial', fontSize: '10px', color: '#15475c' }).setOrigin(.5);
    this.sheet.add([shade, paper, title, body, this.counter]);
    this.previous = this.control(247, 416, '‹', () => this.turn(-1), 'Previous plan page');
    this.next = this.control(513, 416, '›', () => this.turn(1), 'Next plan page');
    this.control(526, 58, '×', () => this.close(), 'Close plan');
  }

  open() {
    if (!this.button || this.disposed) return;
    const scene = this.scene;
    if (scene.mapOpen) scene.toggleMap();
    scene.playerCard?.close(); scene.wardrobe?.close(); scene.catalogue?.close();
    if (!this.sheet) this.buildReader();
    this.isOpen = true; scene._clubPlanOpen = true;
    this.sheet.setVisible(true); this.button.setVisible(false); this.label.setVisible(false);
    if (this.raw === null) this.message('Loading the market plan…');
    else this.draw();
    this.refresh();
  }

  close() {
    this.isOpen = false; this.scene._clubPlanOpen = false;
    this.sheet?.setVisible(false); this.button?.setVisible(true); this.label?.setVisible(true);
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
        this.pages = paginate(raw || 'The market plan is empty.', this.ctx);
        this.page = Math.min(this.page, this.pages.length - 1);
        this.draw();
      }
    } catch (error) {
      if (!this.disposed && this.raw === null) this.message(error.message);
    } finally { this.fetching = false; }
  }

  message(text) { this.pages = paginate(text, this.ctx); this.page = 0; this.draw(); }

  turn(delta) {
    const page = Phaser.Math.Clamp(this.page + delta, 0, this.pages.length - 1);
    if (page === this.page) return;
    this.page = page; this.draw();
    // The native catalogue also flips by replacing the current page texture.
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.body.width, this.body.height);
    ctx.scale(SS, SS); ctx.textBaseline = 'top'; ctx.fillStyle = '#143647';
    for (const row of this.pages[this.page] || []) {
      if (row.text) { ctx.font = row.font; ctx.fillText(row.text, 0, row.y + 1); }
    }
    this.scene.textures.get(this.key).refresh();
    this.counter?.setText(`${this.page + 1} / ${this.pages.length}`);
    this.previous?.setAlpha(this.page ? 1 : .25);
    this.next?.setAlpha(this.page < this.pages.length - 1 ? 1 : .25);
  }

  destroy() {
    this.disposed = true; this.abort.abort(); clearInterval(this.timer);
    this.scene.input.keyboard.off('keydown', this.onKey);
    this.close(); this.sheet?.destroy(true); this.button?.destroy(); this.label?.destroy();
    this.scene.textures.remove(this.key);
    if (this.scene.textures.exists(this.key + '-paper')) this.scene.textures.remove(this.key + '-paper');
  }
}
