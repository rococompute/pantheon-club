// A small adapter around the actual upstream scene and native entities.
// Player controls, room loading, HUD, map, wardrobe and games stay upstream.
import Penguin from '/src/entities/Penguin.js';
import PuffleView from '/src/entities/PuffleView.js';
import Phaser from 'phaser';
import { MovieRoom } from '/src/movie/movie.js';
import { installMovement } from 'virtual:pantheon-movement';

const appearances = [
  [6, 'orange'], [12, 'blue'], [8, 'purple'], [2, 'green'], [3, 'pink'],
  [5, 'red'], [7, 'yellow'], [9, 'brown'], [4, 'black'], [16, 'white'],
];
const isPenguin = a => a.avatar ? a.avatar === 'penguin' : !a.parent && !a.cloud;
const words = { working: 'Working', idle: 'Between requests', needs_input: 'Waiting on you',
  waiting: 'Waiting on you', blocked: 'Waiting on you', limited: 'Usage limit',
  completed: 'Completed', ended: 'Ended', none: 'Session state unavailable' };

class IglooClub {
  constructor(scene) {
    this.scene = scene;
    this.penguins = new Map();
    this.puffles = new Map();
    this.state = null;
    this.disposed = false;
    this.abort = new AbortController();
    this.makePanel();
    this.tick = this.tick.bind(this);
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', () => this.destroy());
    this.poll();
    this.timer = setInterval(() => this.poll(), 2000);
  }

  makePanel() {
    this.panel = document.createElement('section');
    this.panel.id = 'pantheon-club-panel';
    this.panel.innerHTML = `<style>
      #pantheon-club-panel{position:fixed;top:8px;left:8px;z-index:10000;font:12px system-ui;color:#172b36}
      #pantheon-club-panel button{font:inherit;cursor:pointer;border:1px solid #587584;border-radius:12px;padding:5px 9px;background:#f7fcffe8;color:#172b36}
      #pantheon-club-panel aside{margin-top:6px;padding:12px;background:#f7fcfff5;border:1px solid #587584;border-radius:10px;max-width:270px;max-height:60vh;overflow:auto;box-shadow:0 3px 14px #0003}
      #pantheon-club-panel p{margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}
      #pantheon-club-panel h3{margin:0 0 6px} #pantheon-club-panel .club-roster{display:flex;gap:4px;flex-wrap:wrap}
    </style><button type="button" data-open>Agents</button>
    <aside hidden><button type="button" data-close style="float:right" aria-label="Close agent card">×</button>
    <h3>Pantheon</h3><p data-summary>Connecting to the local market…</p><div class="club-roster"></div>
    <h3 data-name></h3><p data-status></p><p data-task></p><button type="button" data-focus hidden>Open agent tab</button></aside>`;
    document.body.append(this.panel);
    const aside = this.panel.querySelector('aside');
    this.panel.querySelector('[data-open]').onclick = () => { aside.hidden = !aside.hidden; };
    this.panel.querySelector('[data-close]').onclick = () => { aside.hidden = true; };
    this.panel.querySelector('[data-focus]').onclick = async () => {
      const agent = this.state?.agents.find(a => a.name === this.selected);
      if (!agent) return;
      const result = await fetch('/focus?agent=' + encodeURIComponent(agent.parent || agent.name), { method: 'POST' });
      if (!result.ok) this.panel.querySelector('[data-status]').textContent = 'No live cmux tab for this agent.';
    };
  }

  async poll() {
    if (this.fetching || this.disposed) return;
    this.fetching = true;
    try {
      const r = await fetch('/state.json', { signal: this.abort.signal });
      if (!r.ok) throw new Error('Local market disconnected');
      const state = await r.json();
      if (!Array.isArray(state.agents)) throw new Error(state.error || 'Invalid local market state');
      this.apply(state);
    } catch (error) {
      if (!this.disposed) this.panel.querySelector('[data-summary]').textContent = 'Local market unavailable. The game still works.';
    } finally { this.fetching = false; }
  }

  apply(state) {
    this.state = state;
    this.panel.querySelector('[data-open]').textContent = `Agents · ${state.agents.length}`;
    this.panel.querySelector('[data-summary]').textContent = `${state.network === 'demo' ? 'Demo market' : state.title || 'Pantheon'} · agents live in your igloo`;
    const roster = this.panel.querySelector('.club-roster');
    roster.replaceChildren();
    for (const agent of state.agents) {
      const button = document.createElement('button');
      button.textContent = agent.name;
      button.onclick = () => this.select(agent.name);
      roster.append(button);
    }
    if (this.selected) this.select(this.selected, false);
    this.reconcile();
  }

  select(name, open = true) {
    const a = this.state?.agents.find(x => x.name === name);
    if (!a) return;
    this.selected = name;
    if (open) this.panel.querySelector('aside').hidden = false;
    this.panel.querySelector('[data-name]').textContent = (a.leader ? '★ ' : '') + a.name;
    this.panel.querySelector('[data-status]').textContent = `${isPenguin(a) ? 'Diplomat penguin' : 'Cloud worker puffle'} · ${words[a.state] || a.state}${a.parent ? ' · follows ' + a.parent : ''}`;
    this.panel.querySelector('[data-task]').textContent = a.task || a.pending?.map(b => b.title).join('\n') || `${a.merges || 0} merged bids`;
    this.panel.querySelector('[data-focus]').hidden = !this.state.live || this.state.network === 'demo';
  }

  inOwnIgloo() {
    return this.scene.currentRoom === 'igloo' && this.scene._playerReady &&
      (!this.scene._iglooVisit || this.scene._iglooVisit === this.scene.network?.playerId);
  }

  interactive(container, name) {
    container.setInteractive(new Phaser.Geom.Rectangle(-23, -60, 46, 83), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', (_p, _x, _y, event) => { event.stopPropagation(); this.select(name); });
  }

  clearActors() {
    for (const p of this.puffles.values()) p.view.destroy();
    for (const p of this.penguins.values()) p.entity.destroy();
    this.puffles.clear(); this.penguins.clear();
  }

  reconcile() {
    if (!this.inOwnIgloo()) { this.clearActors(); return; }
    if (!this.state) return;
    const agents = this.state.agents;
    const roots = agents.filter(isPenguin);
    const rootNames = new Set(roots.map(a => a.name));
    const parentOf = agent => {
      let parent = agent.parent;
      for (let i = 0; i < agents.length && !rootNames.has(parent); i++) parent = agents.find(a => a.name === parent)?.parent;
      return rootNames.has(parent) ? parent : null;
    };
    for (const [name, p] of this.puffles) {
      const agent = agents.find(a => a.name === name);
      if (!agent || isPenguin(agent) || parentOf(agent) !== p.parent) { p.view.destroy(); this.puffles.delete(name); }
    }
    for (const [name, p] of this.penguins) if (!rootNames.has(name)) { p.entity.destroy(); this.penguins.delete(name); }
    roots.forEach((agent, i) => {
      let p = this.penguins.get(agent.name);
      const [color, species] = appearances[i % appearances.length];
      if (!p) {
        const home = { x: 215 + (i % 5) * 80, y: 280 + Math.floor(i / 5) * 65 };
        const entity = new Penguin(this.scene, home.x, home.y, 'pantheon:' + agent.name, agent.name, color, false);
        this.interactive(entity, agent.name);
        p = { entity, home, species, nextMove: 0 };
        this.penguins.set(agent.name, p);
      }
      p.data = agent;
      p.entity.nameTag.setText((agent.leader ? '★ ' : '') + agent.name);
      if (p.lastState !== agent.state) {
        p.lastState = agent.state;
        if (['needs_input', 'waiting', 'blocked'].includes(agent.state)) p.entity.playEmote('wave');
        else if (agent.state === 'working') p.entity.stand();
        else p.entity.sit();
      }
    });
    const slots = new Map();
    for (const agent of agents.filter(a => !isPenguin(a))) {
      const parent = parentOf(agent);
      const owner = this.penguins.get(parent);
      const slot = slots.get(parent) || 0;
      slots.set(parent, slot + 1);
      if (!owner || this.puffles.has(agent.name)) continue;
      // The original follower supports one pet per player. Offset its owner
      // coordinates for siblings, retaining the native follow and animation.
      const follow = new Proxy(owner.entity, { get(target, key) {
        if (key === 'x') return target.x - (slot % 2) * 60;
        if (key === 'y') return target.y + Math.floor(slot / 2) * 25;
        return Reflect.get(target, key, target);
      } });
      const view = new PuffleView(this.scene, { petRowId: 'pantheon:' + agent.name, name: agent.name, species: 'puffle_' + owner.species }, follow);
      this.interactive(view.container, agent.name);
      this.puffles.set(agent.name, { view, parent });
    }
  }

  tick(time, delta) {
    if (this.inOwnIgloo() !== (this.penguins.size > 0)) this.reconcile();
    if (!this.inOwnIgloo()) return;
    for (const p of this.penguins.values()) {
      if (p.data.state !== 'working' || p.entity.isMoving || time < p.nextMove) continue;
      p.nextMove = time + 6000 + Math.random() * 9000;
      p.entity.moveTo(p.home.x + Math.random() * 36 - 18, p.home.y + Math.random() * 24 - 12, 80);
    }
    for (const p of this.puffles.values()) p.view.tick(Math.min(.1, (delta || 16.7) / 1000));
  }

  destroy() {
    this.disposed = true; this.abort.abort(); clearInterval(this.timer);
    this.scene.events.off('update', this.tick);
    this.clearActors(); this.panel.remove();
  }
}

export function installClub(RoomScene) {
  installMovement(MovieRoom);
  const create = RoomScene.prototype.create;
  RoomScene.prototype.create = function (...args) {
    const result = create.apply(this, args);
    // Keep the upstream igloo and layout, without its floating editor button.
    this.igloo._syncEditBtn = () => {
      this.igloo._editBtn?.remove();
      this.igloo._editBtn = null;
    };
    this.igloo._syncEditBtn();
    window.__pantheonClub = new IglooClub(this);
    return result;
  };
}
