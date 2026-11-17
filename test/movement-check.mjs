import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { safePath, recoverPlayer, installMovement } from '../game/movement.mjs';

test('a walk stops on a valid integer pixel at a wall edge', () => {
  const movie = { hitBlock: x => x >= 100.8 };
  const end = safePath(movie, 50.6, 200, 120.6, 200);
  assert(end.x > 90, 'the penguin still approaches the wall');
  assert(!movie.hitBlock(end.x, end.y), 'rounding cannot place its feet inside the wall');
  assert.deepEqual(safePath(movie, end.x, end.y, 50, 200), { x: 50, y: 200 }, 'it can walk away again');
});

test('walk endpoints stay within the playable floor', () => {
  const movie = { hitBlock: () => false };
  for (const target of [[-100, 100], [900, 200], [100, -90], [100, 700]]) {
    const end = safePath(movie, 380, 300, ...target);
    assert(end.x >= 20 && end.x <= 740 && end.y >= 20 && end.y <= 430);
  }
});

test('an already trapped player is freed and its old walk cannot drag it back', () => {
  const sent = [], stopped = [];
  const player = { x: 590, y: 190, isMoving: true, moveTarget: {}, _moveDone: () => {},
    moveTween: { stop: () => stopped.push(true) },
    setPosition(x, y) { this.x = x; this.y = y; }, updateDepth() {}, stand() {} };
  const scene = { localPlayer: player, network: { sendMove: (...args) => sent.push(args) }, movie: {
    hitBlock: (x, y) => y < 250, findSafeSpawn: () => ({ x: 590, y: 270 }), isValidSpawn: (_x, y) => y >= 250,
  } };
  assert(recoverPlayer(scene));
  assert.deepEqual([player.x, player.y], [590, 270]);
  assert.equal(stopped.length, 1);
  assert.equal(player.moveTarget, null);
  assert.equal(player.moveTween, null);
  assert.equal(player._moveDone, null);
  assert.equal(player.isMoving, false);
  assert.deepEqual(sent, [[590, 270]]);
  assert(recoverPlayer(scene));
  assert.equal(sent.length, 1, 'walking on valid floor does not teleport');
});

test('room collision is ready only after the latest serialized build', async () => {
  const built = [], release = [];
  class Movie {
    buildCollision(scale) { built.push(scale); return new Promise(resolve => release.push(resolve)); }
  }
  installMovement(Movie);
  const movie = new Movie();
  const first = movie.buildCollision(2.25);
  assert.equal(movie.buildCollision(2.25), first, 'duplicate builds share the mask');
  const second = movie.buildCollision(3);
  await setImmediate();
  assert.deepEqual(built, [2.25]);
  assert.equal(movie._clubCollisionReady, false);
  release.shift()(); await first; await setImmediate();
  assert.deepEqual(built, [2.25, 3]);
  assert.equal(movie._clubCollisionReady, false, 'an old result cannot unlock the room');
  release.shift()(); await second;
  assert.equal(movie._clubCollisionReady, true);
});
