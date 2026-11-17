#!/usr/bin/env python3
"""Export a self-contained demo for visual review without a local server."""
import base64
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]
CLUB = ROOT / 'club'

def data_url(content, mime):
    return 'data:' + mime + ';base64,' + base64.b64encode(content).decode()

swl = data_url((CLUB / 'vendor/swl.js').read_bytes(), 'text/javascript')
renderer = (CLUB / 'vendor/swlCanvas.js').read_text().replace("'./swl.js'", json.dumps(swl))
js = (CLUB / 'club.js').read_text().replace("'./vendor/swl.js'", json.dumps(swl)).replace("'./vendor/swlCanvas.js'", json.dumps(data_url(renderer.encode(), 'text/javascript')))
assets = {}
for name, mime in [('coffee.swl','application/octet-stream'), ('coffee-atlas.png','image/png'), ('penguin-atlas.png','image/png'), ('penguin-body.png','image/png'), ('penguin-frames.json','application/json'), ('puffle.pack','image/svg+xml')]:
    assets['/assets/' + name] = data_url((CLUB / 'assets' / name).read_bytes(), mime)
module = runpy.run_path(str(ROOT / 'pantheon-club'), run_name='pantheon_club')
state = module['Demo']().state()
# A frozen fixture makes screenshots reproducible and says DEMO in the UI.
state['agents'][0]['state'] = 'working'
state['agents'][1]['state'] = 'working'
state['agents'][2]['state'] = 'needs_input'
state['agents'][3]['state'] = 'limited'
bootstrap = 'const offlineAssets=' + json.dumps(assets) + ';const nativeFetch=window.fetch.bind(window);window.fetch=async(path,opts)=>path==="/state.json"?new Response(JSON.stringify(' + json.dumps(state) + '),{headers:{"Content-Type":"application/json"}}):nativeFetch(offlineAssets[path]||path,opts);\n'
js = js.replace('img.src=src;', 'img.src=offlineAssets[src]||src;')
page = (CLUB / 'index.html').read_text().replace('<link rel="stylesheet" href="/club.css">', '<style>' + (CLUB / 'club.css').read_text() + '</style>')
page = page.replace('<script type="module" src="/club.js"></script>', '<script type="module">' + bootstrap + js + '</script>')
target = Path(sys.argv[1]) if len(sys.argv)>1 else Path('/private/tmp/pantheon-club-preview.html')
target.write_text(page)
print(target)
