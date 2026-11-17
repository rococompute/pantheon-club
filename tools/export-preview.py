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
movie = data_url((CLUB / 'vendor/movie/movie.js').read_bytes(), 'text/javascript')
clip = (CLUB / 'vendor/movie/clip.js').read_text().replace("'./movie.js'", json.dumps(movie))
js = js.replace("'./vendor/movie/movie.js'", json.dumps(movie)).replace("'./vendor/movie/clip.js'", json.dumps(data_url(clip.encode(), 'text/javascript')))
assets = {}
for name, mime in [('coffee.swl','application/octet-stream'), ('coffee-atlas.png','image/png'), ('puffle.pack','image/svg+xml')]:
    assets['/assets/' + name] = data_url((CLUB / 'assets' / name).read_bytes(), mime)
for asset in (CLUB / 'assets/penguin').rglob('*'):
    if asset.is_file():
        assets['/' + asset.relative_to(CLUB).as_posix()] = data_url(asset.read_bytes(), 'application/json' if asset.suffix == '.json' else 'application/octet-stream')
module = runpy.run_path(str(ROOT / 'pantheon-club'), run_name='pantheon_club')
state = module['Demo']().state()
# A frozen fixture makes screenshots reproducible and says DEMO in the UI.
state['agents'][0]['state'] = 'working'
state['agents'][1]['state'] = 'working'
state['agents'][2]['state'] = 'needs_input'
state['agents'][3]['state'] = 'limited'
bootstrap = 'window.Worker=undefined;const offlineAssets=' + json.dumps(assets) + ';const nativeFetch=window.fetch.bind(window);window.fetch=async(path,opts)=>path==="/state.json"?new Response(JSON.stringify(' + json.dumps(state) + '),{headers:{"Content-Type":"application/json"}}):nativeFetch(offlineAssets[path]||path,opts);\n'
js = js.replace('img.src=src;', 'img.src=offlineAssets[src]||src;')
page = (CLUB / 'index.html').read_text().replace('<link rel="stylesheet" href="/club.css">', '<style>' + (CLUB / 'club.css').read_text() + '</style>')
page = page.replace('<script type="module" src="/club.js"></script>', '<script type="module">' + bootstrap + js + '</script>')
target = Path(sys.argv[1]) if len(sys.argv)>1 else Path('/private/tmp/pantheon-club-preview.html')
target.write_text(page)
print(target)
