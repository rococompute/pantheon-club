# Third-party provenance

The visual source is [Claude Penguin by Arenovisk (gabixou)](https://github.com/gabixou/claude-penguin), pinned at commit `db36a6d22fd745edc4300b4c562efbc862e1e06d`. Its README identifies it as a non-commercial fan project, credits GoPenguin and the community, and reserves Club Penguin assets, names, and trademarks to their respective owners. It does not provide a general-purpose license grant. This repository does not claim ownership or relicense those materials.

The default Club View now runs the full upstream Phaser/Vite client and Node/SQLite server. `scripts/setup-game` fetches the pinned checkout and installs its lockfile dependencies into ignored `.upstream/claude-penguin/`; those files are not republished by this repository. Upstream sources stay unchanged on disk. The local adapter installs native penguin and puffle entities inside the player's igloo and constrains the game server to loopback. No public game server or public hosting is used.

The copied files described below belong to the preserved standalone Coffee Shop prototype (`pantheon-club view`), not the new default game.

The following files are copied unchanged. [provenance.json](club/assets/provenance.json) records the exact upstream paths and Git blob hashes so the copies can be audited.

| Local file | Upstream source |
| --- | --- |
| `club/assets/coffee-atlas.png` | `client/public/assets/rooms-swl/swl-coffee-0.png` |
| `club/assets/coffee.swl` | `client/public/assets/scenes/coffee.swl` |
| `club/assets/puffle.pack` | `client/public/assets/puffle-icons/blue/chars/chunk-0-cf65db61.pack` |
| `club/assets/puffle.json` | `client/public/assets/puffle-icons/blue/timelines.json` |
| `club/vendor/swl.js` | `client/src/swl/swl.js` |
| `club/vendor/swlCanvas.js` | `client/src/swl/swlCanvas.js` |

`club/club.js`, `club/club.css`, and `club/index.html` implement the Pantheon-specific view. Its blue HUD styling follows the reference project's classic web HUD, adapted to agent cards, an activity ticker, and a roster. The Coffee Shop is rendered through the reference's SWL Canvas renderer; all penguins use its native `MovieRoom`/`Clip` timeline renderer and solid body color transforms, with the `ring` and `hotspot` layers hidden, and cloud puffles are composed from its original SVG character shapes and tinted to their parent's color.

Club Penguin, Disney, and Miniclip names and marks are used only to identify this personal fan project's source and inspiration. This repository contains no affiliation or endorsement claim, commercial setup, payment integration, ads, or storefront.

The native renderer also uses these unchanged files from the same pinned commit:

| Local file | Upstream source |
| --- | --- |
| `club/vendor/movie/movie.js` | `client/src/movie/movie.js` |
| `club/vendor/movie/clip.js` | `client/src/movie/clip.js` |
| `club/vendor/workers/manifest.worker.js` | `client/src/workers/manifest.worker.js` |
| `club/vendor/workers/tint.worker.js` | `client/src/workers/tint.worker.js` |
| `club/assets/penguin/timelines.json` | `client/public/assets/movies/penguin/timelines.json` |
| `club/assets/penguin/chars/*.pack` | `client/public/assets/movies/penguin/chars/*.pack` (all twenty chunks) |
