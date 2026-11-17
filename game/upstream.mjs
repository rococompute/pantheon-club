function replaceOnce(code, before, after) {
  if (code.split(before).length !== 2) throw new Error('Upstream room controls changed; review the movement adapter.');
  return code.replace(before, after);
}

export function transformRoomScene(source) {
  let code = source.replace(/\r\n/g, '\n');
  code = replaceOnce(code, 'const wy = pointer.worldY;',
    'if (!this._movieReady || !this.movie?._clubCollisionReady) return;\n            const wy = pointer.worldY;');
  code = replaceOnce(code, 'let dest = { x: targetX, y: targetY };',
    'if (!recoverPlayer(this)) return;\n            let dest = { x: targetX, y: targetY };');
  code = replaceOnce(code, 'this._interactions.build();',
    `this._interactions.build();
                await movie.buildCollision(this._ss);
                if (this.movie !== movie || this.currentRoom !== roomKey) { releaseHold(); return; }`);
  code = replaceOnce(code, `this.time.delayedCall(1500, () => {
                    if (this.movie === movie) movie.buildCollision(this._ss)
                        .catch((e) => console.warn('[movie] buildCollision', e));
                });`, '// Collision and exit triggers are ready before the room is revealed.');
  return "import {recoverPlayer} from 'virtual:pantheon-movement';\n" + code;
}
