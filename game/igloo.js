// A small adapter around the actual upstream scene and native entities.
// Player controls, room loading, HUD, map, wardrobe and games stay upstream.
import Penguin from '/src/entities/Penguin.js';
import PuffleView from '/src/entities/PuffleView.js';
import { MovieRoom } from '/src/movie/movie.js';
import { installMovement } from 'virtual:pantheon-movement';
import { PlanPoster } from 'virtual:pantheon-plan';

const appearances = [
  [6, 'orange'], [12, 'blue'], [8, 'purple'], [2, 'green'], [3, 'pink'],
  [5, 'red'], [7, 'yellow'], [9, 'brown'], [4, 'black'], [16, 'white'],
];
const isPenguin = a => a.avatar ? a.avatar === 'penguin' : !a.parent && !a.cloud;

class IglooClub {
  constructor(scene) {
    this.scene = scene;
    this.penguins = new Map();
    this.puffles = new Map();
    this.state = null;
    this.disposed = false;
    this.abort = new AbortController();
    this.poster = new PlanPoster(scene);
    this.tick = this.tick.bind(this);
    scene.events.on('update', this.tick);
    scene.events.once('shutdown', () => this.destroy());
    this.poll();
    this.timer = setInterval(() => this.poll(), 2000);
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
      // Keep the last agent projection while the market is unavailable.
    } finally { this.fetching = false; }
  }

  apply(state) {
    this.state = state;
    this.reconcile();
  }

  inOwnIgloo() {
    return this.scene.currentRoom === 'igloo' && this.scene._playerReady &&
      (!this.scene._iglooVisit || this.scene._iglooVisit === this.scene.network?.playerId);
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
    this.clearActors(); this.poster.destroy();
  }
}

export function installClub(RoomScene) {
  installMovement(MovieRoom);
  const handleAction = RoomScene.prototype.handleAction;
  RoomScene.prototype.handleAction = function (...args) {
    if (!this._clubPlanOpen) return handleAction.apply(this, args);
  };
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
