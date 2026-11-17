# Third-party provenance

The visual source is [Claude Penguin by Arenovisk (gabixou)](https://github.com/gabixou/claude-penguin), pinned at commit `db36a6d22fd745edc4300b4c562efbc862e1e06d`. Its README identifies it as a non-commercial fan project, credits GoPenguin and the community, and reserves Club Penguin assets, names, and trademarks to their respective owners. It does not provide a general-purpose license grant. This repository does not claim ownership or relicense those materials.

The following files are copied unchanged. [provenance.json](club/assets/provenance.json) records the exact upstream paths and Git blob hashes so the copies can be audited.

| Local file | Upstream source |
| --- | --- |
| `club/assets/coffee-atlas.png` | `client/public/assets/rooms-swl/swl-coffee-0.png` |
| `club/assets/coffee.swl` | `client/public/assets/scenes/coffee.swl` |
| `club/assets/penguin-atlas.png` | `client/public/assets/penguin-atlas.png` |
| `club/assets/penguin-body.png` | `client/public/assets/penguin-body.png` |
| `club/assets/penguin-frames.json` | `client/public/assets/penguin-frames.json` |
| `club/assets/puffle.pack` | `client/public/assets/puffle-icons/blue/chars/chunk-0-cf65db61.pack` |
| `club/assets/puffle.json` | `client/public/assets/puffle-icons/blue/timelines.json` |
| `club/vendor/swl.js` | `client/src/swl/swl.js` |
| `club/vendor/swlCanvas.js` | `client/src/swl/swlCanvas.js` |

`club/club.js`, `club/club.css`, and `club/index.html` implement the Pantheon-specific view. Its blue HUD styling follows the reference project's classic web HUD, adapted to agent cards, an activity ticker, and a roster. The Coffee Shop is rendered through the reference's SWL Canvas renderer; diplomats use its eight-direction sprite sheets, and cloud puffles are composed from its original SVG character shapes and tinted to their parent's color.

Club Penguin, Disney, and Miniclip names and marks are used only to identify this personal fan project's source and inspiration. This repository contains no affiliation or endorsement claim, commercial setup, payment integration, ads, or storefront.
