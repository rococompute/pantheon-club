# Pantheon Club

A local, personal, non-commercial fan extension of [Pantheon’s cmux integration](https://github.com/rococompute/pantheon/tree/master/integrations/cmux), using the **actual [Claude Penguin game](https://github.com/gabixou/claude-penguin)** rather than a recreated scene.

You play your own penguin with the original game’s controls, map, rooms, wardrobe and available minigames. Pantheon penguins and their cloud-worker puffles appear **only in your own igloo**. They use the game’s native entities, colors, animations and follower logic. Leaving the igloo removes them; returning restores them. The Agents panel shows work status and can focus an agent’s cmux tab. The extra My igloo and floating Edit Igloo buttons are omitted.

## Run locally

Requires Node **24+** (including built-in SQLite), Python 3.10+, Git and npm. The one-time setup downloads the pinned upstream client/server and about **862 MB of game assets**. Dependencies and assets stay in the ignored `.upstream/` directory.

```sh
./scripts/setup-game
./pantheon-club game demo
# Open http://127.0.0.1:8767/?room=igloo&penguin=You

# Connect to a market without changing its cmux layout:
./pantheon-club game /path/to/NET --port 8767
# Ctrl-C stops the client server, game server and state bridge.
```

The original `pantheon-club view RECORD|demo` and `pantheon-club serve NET` entry points also launch this full local game. Existing cmux tabs are reused by `attach` and navigated to the game, retaining the Club View → plan.md → watchdog order.

Everything is hosted on **127.0.0.1**: the Vite client, WebSocket game server and Pantheon state bridge. This does not connect to the project’s public game server, use public hosting, or expose a LAN listener. The WebSocket server rejects foreign browser origins. Your player and igloo persist in `.local-game/penguin.db`; no external account is required. Game assets are served locally after setup. Installation requires Internet access.

The browser polls sanitized Pantheon status every two seconds. An unavailable market does not stop the game. The bridge does not serve node keys or source checkouts. The game server has no access to Pantheon’s agent controls; focusing a tab goes through the separate local bridge.

Walking uses the original click-to-move controls. The pinned upstream client has no arrow-key walking handler; W, D and S are action shortcuts. The local adapter waits for collision and door triggers before allowing walking, validates rounded wall-edge destinations, and recovers a player already caught inside a building on the next floor click.

## cmux integration

Requires macOS with cmux running, an existing Pantheon checkout and initialized network. Use Pantheon’s default `plan` layout.

```sh
export PANTHEON_CMUX=/path/to/pantheon/integrations/cmux/pantheon-cmux
./pantheon-club up /path/to/NET --diplomats "claude codex grok muse" -- --goal /path/to/goal.txt
# Or attach to an existing market:
./pantheon-club attach /path/to/NET
./pantheon-club down /path/to/NET
```

The left half contains **Club View → plan.md → watchdog**. The right half keeps the diplomat and node panes. Repeated `attach` reuses the game process and tab. Attached game metadata, logs and its local player database live in `NET/.cmux/club/`. `down` stops the game and Pantheon workspace; leaving the workspace alone does not erase the player database. The extension does not modify Pantheon’s source.

## Agent appearances

Every primary participant is a native penguin, including scripted nodes. A star marks the leader. Working agents move a little; agents needing input wave; idle or limited agents sit. The panel distinguishes these states. Missing session hooks are reported as unavailable.

Cloud workers follow their parent as native puffles of the matching color family. Siblings have separate follow positions. Child network nodes also become puffles when they have an identified parent; `NET/NODE/parent` overrides the inferred relationship. Completed workers remain until removed. Agents are visual projections, not additional multiplayer accounts.

## Cloud workers

Cloud sessions do not have Pantheon node directories. Register the actual provider task id when spawning one:

```sh
./pantheon-club worker NET task-42 --parent codex --task "Prove the codec round trip"
./pantheon-club worker NET task-42 --parent codex --state needs_input
./pantheon-club worker NET task-42 --parent codex --state completed
./pantheon-club worker NET task-42 --remove
```

States: `working`, `idle`, `needs_input`, `limited`, `completed`, `ended`. Registration and updates are atomic and locked so parallel task launches do not overwrite each other. Use a distinct name from the network nodes.

`attach` installs `NET/.cmux/DIPLOMAT/desk/club-worker`, which supplies the network and parent automatically:

```sh
/path/to/NET/.cmux/codex/desk/club-worker task-42 --task "Prove the codec round trip"
/path/to/NET/.cmux/codex/desk/club-worker task-42 --state completed
```

It adds these instructions to each diplomat's desk and prints a short reminder on inbox waits. The original inbox wrapper is preserved as `pantheon-inbox.club-base` and invoked unchanged. Provider task status must be reported through this bridge: the extension does not infer private cloud sessions from unrelated processes or launch paid tasks itself. Completed workers stay visible until dismissed. It does not persist cloud-worker metadata into Pantheon's archived run format yet.

## Implementation and checks

`scripts/setup-game` pins upstream commit `db36a6d22fd745edc4300b4c562efbc862e1e06d`. Upstream files stay unchanged on disk. `game/run.mjs` installs `game/igloo.js` around the original room scene; `game/upstream.mjs` and `game/movement.mjs` apply the collision readiness, endpoint and recovery fixes at load time. `game/loopback.mjs` constrains the original server listener at module load. The only follower adaptation is an owner-coordinate offset for multiple puffles; rendering and animation remain native.

```sh
python3 -m unittest discover -s test -v
node --test test/movement-check.mjs
# With a local native game already running (Chrome required):
node test/game-check.mjs
```

The browser check exercises native sprite loading, multiple same-color puffles, player movement through floor clicks, map travel, clearing and restoring actors, and exclusion from another player’s igloo. It also checks Town/Gift Shop wall-edge clicks, clicks before collision is ready, recovery from the reproduced stuck position, and normal door entry. It checks browser exceptions and game network destinations. `CHROME` overrides the Chrome binary; `CLUB_SCREENSHOT` selects the screenshot path.

The earlier standalone Coffee Shop prototype remains under `club/` and is available only through the explicit `pantheon-club legacy-view demo` command for comparison. Its export tool and `room-check.mjs`/`client-check.mjs` checks apply only to that prototype. The calculator helper in `scripts/dogfood-calculator` still prepares and launches a separate sample Pantheon market; attaching now uses the full game. Game installation is checked before `up` starts a market. The normal Python state API serves only status and tab-focus requests, not the prototype.

## Fan-use scope and credits

This separate repository is for personal, non-commercial fan use, with no commercial product, billing, storefront, advertising, or monetization setup. It is not affiliated with or endorsed by Disney, Club Penguin, or Miniclip. Names, trademarks, and third-party art remain their owners' property. Making a repository public does not grant new rights in those assets.

See [THIRD_PARTY.md](THIRD_PARTY.md) for pinned source paths, attribution, and asset provenance, and [LICENSE](LICENSE) for the scope of permission for original contributions.
