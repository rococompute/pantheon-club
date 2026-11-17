# Pantheon Club

A personal, non-commercial fan extension of [Pantheon's cmux integration](https://github.com/rococompute/pantheon/tree/master/integrations/cmux). A single Pantheon market becomes a room in the Coffee Shop, using art and rendering from [gabixou/claude-penguin](https://github.com/gabixou/claude-penguin).

The left half has three tabs, in order:

1. **Club View** — the live room.
2. **plan.md** — Pantheon's existing live plan.
3. **watchdog** — Pantheon's existing watchdog.

The right half keeps Pantheon's diplomat and node panes. This repository runs alongside Pantheon and does not modify its source.

## Run it

Requires Python 3.10+, macOS with cmux running, and an existing Pantheon checkout and initialized network. There are no Python packages, npm dependencies, accounts, or external services to install for the view.

```sh
# Clone this beside your pantheon checkout, or set PANTHEON_CMUX.
export PANTHEON_CMUX=/path/to/pantheon/integrations/cmux/pantheon-cmux

# Start one market, with the usual pantheon-cmux options and node arguments.
./pantheon-club up /path/to/NET --diplomats "claude codex grok muse" -- --goal /path/to/goal.txt

# Or add the room to an already-running market.
./pantheon-club attach /path/to/NET

# Stop its local view server and the Pantheon cmux workspace.
./pantheon-club down /path/to/NET
```

Use Pantheon's default `plan` layout. The extension checks that the plan and watchdog are present, places Club View first, then explicitly places the plan second and watchdog third. Repeated `attach` reuses the existing club tab. `PANTHEON_CMUX` and `CMUX` can override the two command paths.

The server binds only to `127.0.0.1`, chooses an available port, and stops after the workspace disappears. View metadata lives in `NET/.cmux/club/`. The view reads status summaries and session hooks; it never serves node keys, checkouts, or arbitrary network files.

## What you see

- **Penguins:** every primary network agent, including scripted participants, each with a distinct color. Diplomats get their states from cmux session hooks; scripted agents use their node status. Working agents gather on the floor; agents waiting for you wave by the door; agents at a usage limit sit near the sofas. Missing session hooks are shown as unknown rather than assumed to be working.
- **Leader:** the current term's leader has a gold star.
- **Puffles:** spawned provider cloud workers follow their parent and use exactly its color. Child network nodes with a diplomat parent are also puffles. An explicit `NET/NODE/parent` file overrides node-name/provider matching. Primary roster nodes remain penguins even when their bidders are scripted.
- **You:** your own local penguin. Click the floor or use arrow keys/WASD to move; the You button changes its name, color, or emote (wave, dance, sit, stand). Appearance is saved in this browser. Furniture bounds prevent walking into the counter and sofas.
- **Color:** uses the reference's native `MovieRoom`/`Clip` body color transform, with selection-ring and hotspot layers hidden. Faces, outlines, and feet retain their original art.
- **Work:** the blue activity bar reports the latest bid. Clicking a penguin or puffle opens its state and task card; its button opens the relevant cmux tab. Cloud tasks open their parent's tab.
- **Accessibility:** characters are keyboard-accessible buttons, the Agents button provides a textual roster, and animation can be paused. The view honors reduced-motion preferences.

Only one market is shown per room. It polls state every two seconds and marks a disconnected view after three failed polls.

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

## Preview and checks

To try the real calculator example from a normal terminal with cmux running:

```sh
./scripts/dogfood-calculator
```

This initializes a separate four-node network in `.dogfood/calculator/`, checks the
calculator baseline, then starts the market with the subtraction and multiplication
goals and attaches Club View. The default uses scripted bidders and no model calls;
these nodes appear as agent penguins. To exercise interactive diplomats with your
installed provider CLIs, set `CLUB_DIPLOMATS="claude codex"` before the command.
The provider CLIs use Pantheon's existing unattended-session settings.

`./scripts/dogfood-calculator --prepare` only prepares and checks the example;
`./scripts/dogfood-calculator --stop` stops its workspace. A final directory argument
selects a separate run directory. Runs and generated keys stay in the ignored
`.dogfood/` directory, outside the committed source. The market uses ports 43600–43603;
set `CLUB_BASE_PORT` before preparing a new network if those are occupied.

The live calculator workspace has been launched successfully in cmux. Its four network
nodes, Club → plan.md → watchdog order, live state endpoint, and native room rendering
have been inspected. Claude and Codex run as diplomats; Grok and Muse currently use
scripted bidders. The calculator market has pending bids; a completed calculator goal
has not been verified.

```sh
./pantheon-club view demo --port 8767        # http://127.0.0.1:8767
./pantheon-club view ~/.pantheon/runs/RUN   # inspect an archived run
./pantheon-club state NET                  # inspect the JSON state
python3 -m unittest discover -s test -v
node test/room-check.mjs
node test/client-check.mjs                  # requires Playwright + Chromium
python3 tools/export-preview.py /tmp/pantheon-club-preview.html
```

The view itself has no npm dependency. The optional browser acceptance test uses
Playwright: install it with `npm install --no-save --package-lock=false playwright`,
then `npx playwright install chromium`. `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to existing local installations. It starts
and stops its own demo server and checks real rendered body colors, floor/keyboard
movement, collision limits, dance, and appearance persistence.

The last command exports a self-contained, clearly labeled demo file with embedded assets for offline visual review. It is a fixture, not a live market connection.

## Fan-use scope and credits

This separate repository is for personal, non-commercial fan use, with no commercial product, billing, storefront, advertising, or monetization setup. It is not affiliated with or endorsed by Disney, Club Penguin, or Miniclip. Names, trademarks, and third-party art remain their owners' property. Making a repository public does not grant new rights in those assets.

See [THIRD_PARTY.md](THIRD_PARTY.md) for pinned source paths, attribution, and asset provenance, and [LICENSE](LICENSE) for the scope of permission for original contributions.
