// Small collision fixes around the upstream game, without changing its art,
// room interactions, walk animation, or click-to-move controls.
export function walkable(movie, x, y) {
  return Number.isFinite(x) && Number.isFinite(y) &&
    x >= 20 && x <= 740 && y >= 20 && y <= 430 && !movie.hitBlock(x, y);
}

export function safePath(movie, sx, sy, tx, ty) {
  if (![sx, sy, tx, ty].every(Number.isFinite)) return { x: sx, y: sy };
  const dx = tx - sx, dy = ty - sy;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
  let last = { x: sx, y: sy };
  for (let i = 1; i <= steps; i++) {
    const x = sx + dx * i / steps, y = sy + dy * i / steps;
    const rx = Math.round(x), ry = Math.round(y);
    // Upstream checked the float but returned an unchecked rounded point,
    // which can put the player's feet inside a wall's collision pixel.
    if (!walkable(movie, x, y) || !walkable(movie, rx, ry)) break;
    last = { x: rx, y: ry };
  }
  return last;
}

export function recoverPlayer(scene) {
  const player = scene.localPlayer, movie = scene.movie;
  if (walkable(movie, player.x, player.y)) return true;
  // Recover a player left inside a building by an old click or a late mask.
  const safe = movie.findSafeSpawn(player.x, player.y);
  if (!movie.isValidSpawn(safe.x, safe.y)) return false;
  player.moveTween?.stop();
  player.moveTween = null; player.moveTarget = null; player._moveDone = null;
  player.isMoving = false;
  player.setPosition(safe.x, safe.y); player.updateDepth(); player.stand();
  scene.network.sendMove(safe.x, safe.y);
  return true;
}

export function installMovement(MovieRoom) {
  const build = MovieRoom.prototype.buildCollision;
  MovieRoom.prototype.buildCollision = function (scale) {
    if (this._clubCollisionScale === scale && this._clubCollisionBuild) return this._clubCollisionBuild;
    this._clubCollisionReady = false;
    this._clubCollisionScale = scale;
    // Coalesce repeated builds and serialize scale changes; native builds
    // temporarily clear the shared block and trigger grids.
    const pending = Promise.resolve(this._clubCollisionBuild).catch(() => {}).then(() => build.call(this, scale));
    const current = pending.then(() => {
      if (this._clubCollisionBuild === current) this._clubCollisionReady = true;
    }, error => {
      if (this._clubCollisionBuild === current) this._clubCollisionBuild = null;
      throw error;
    });
    this._clubCollisionBuild = current;
    return current;
  };
  MovieRoom.prototype.findPath = function (...args) { return safePath(this, ...args); };
}
