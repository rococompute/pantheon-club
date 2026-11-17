import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
# runpy functions retain their own globals, which are patched directly below.
m = runpy.run_path(str(ROOT / 'pantheon-club'), run_name='club_test')
g = m['build_state'].__globals__

class ClubTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.net = Path(self.tmp.name)
        for name in ['claude', 'codex', 'codex-cloud1']:
            d = self.net / name
            d.mkdir()
            (d / 'genesis.json').write_text('{}')
            (d / 'key.json').write_text('NEVER SERVE THIS KEY')
            (d / 'status.txt').write_text('height 12  term 3  leader codex\n'
                'task 1 [open] calc: "make subtraction"\n'
                'bid 9 [pending] task 1 by codex-cloud1 test\n'
                'title 9 Subtract values\ncount codex.merges 2\n')
        for name in ['claude','codex']:
            d = self.net / '.cmux' / name
            (d / 'desk').mkdir(parents=True)
            (d / 'surface').write_text(name + '-surface')
            (d / 'desk/instructions.md').write_text('Original instructions\n')
        (self.net / '.cmux/workspace').write_text('workspace-id')

    def tearDown(self):
        self.tmp.cleanup()

    def state(self):
        with patch.dict(g, session_states=lambda *_: {'codex':'working','claude':'needs_input'}):
            return m['build_state'](str(self.net))

    def test_diplomats_nodes_and_parent_colors(self):
        s = self.state()
        a = {x['name']:x for x in s['agents']}
        self.assertTrue(a['claude']['diplomat'])
        self.assertEqual(a['claude']['state'],'needs_input')
        self.assertFalse(a['codex-cloud1']['diplomat'])
        self.assertEqual(a['codex-cloud1']['parent'],'codex')
        self.assertEqual(a['codex-cloud1']['color'],a['codex']['color'])
        self.assertEqual(a['codex-cloud1']['state'],'working')
        self.assertEqual(a['codex-cloud1']['avatar'],'puffle')
        self.assertEqual(s['title'],'Market (codex leader)')
        self.assertNotIn('NEVER SERVE',json.dumps(s))
        (self.net/'codex-cloud1/parent').write_text('claude')
        self.assertEqual({x['name']:x for x in self.state()['agents']}['codex-cloud1']['parent'],'claude')

    def test_cloud_worker_lifecycle_without_network_node(self):
        m['cmd_worker']([str(self.net),'cloud-task-42','--parent','codex','--task','Prove codec'])
        a = {x['name']:x for x in self.state()['agents']}
        self.assertTrue(a['cloud-task-42']['cloud'])
        self.assertEqual(a['cloud-task-42']['avatar'],'puffle')
        self.assertEqual(a['cloud-task-42']['color'],a['codex']['color'])
        self.assertFalse((self.net/'cloud-task-42').exists())
        m['cmd_worker']([str(self.net),'cloud-task-42','--parent','codex','--state','completed'])
        self.assertEqual(self.state()['agents'][-1]['state'],'completed')
        m['cmd_worker']([str(self.net),'cloud-task-42','--remove'])
        self.assertNotIn('cloud-task-42',m['read_workers'](str(self.net)))

    def test_worker_names_and_parents_are_validated(self):
        for args in [['../escape','--parent','codex'],['worker','--parent','unknown'],['codex','--parent','codex']]:
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                m['cmd_worker']([str(self.net),*args])

    def test_helper_instructions_are_idempotent(self):
        m['install_worker_helpers'](str(self.net));m['install_worker_helpers'](str(self.net))
        instructions=(self.net/'.cmux/codex/desk/instructions.md').read_text()
        self.assertTrue(instructions.startswith('Original instructions'))
        self.assertEqual(instructions.count('## Club View cloud workers'),1)
        self.assertIn('--parent codex',(self.net/'.cmux/codex/desk/club-worker').read_text())

    def test_attach_reuses_tab_and_shifts_plan_watchdog(self):
        ids = ['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']
        tabs = [dict(id=ids[0],title='plan.md'),dict(id=ids[1],title='watchdog')]
        club='abcdefab-1234-1234-1234-abcdefabcdef'
        calls=[]
        def cm(*args,**kw):
            calls.append(args)
            if 'new-surface' in args:
                tabs.append(dict(id=club,title='Club View'))
                return f'OK surface:3 ({club})'
            if args[0]=='reorder-surface':
                tab=next(t for t in tabs if t['id']==args[args.index('--surface')+1])
                tabs.remove(tab);tabs.insert(int(args[args.index('--index')+1]),tab)
            return 'OK'
        def cm_json(*args):
            return {'panes':[{'id':'left-pane','surface_ids':[t['id'] for t in tabs]}]} if 'list-panes' in args else {'surfaces':tabs}
        game_url = 'http://127.0.0.1:8767/?room=igloo&penguin=You'
        with patch.dict(g,need_cmux=lambda:None,workspace_alive=lambda _:True,start_game=lambda _:game_url,cm=cm,cm_json=cm_json):
            with contextlib.redirect_stdout(io.StringIO()):
                m['cmd_attach']([str(self.net)]);m['cmd_attach']([str(self.net)])
        self.assertEqual([t['title'] for t in tabs],['Club View','plan.md','watchdog'])
        self.assertEqual(sum('new-surface' in c for c in calls),1)
        self.assertTrue(any(c[0]=='browser' and 'navigate' in c for c in calls))
        self.assertTrue(any('--url' in c and game_url in c for c in calls))

    def test_record_has_diplomats_without_cmux(self):
        import shutil
        shutil.rmtree(self.net/'.cmux')
        (self.net/'run.txt').write_text('diplomats claude codex\n')
        s=m['build_state'](str(self.net),live=False)
        self.assertEqual(sum(a['diplomat'] for a in s['agents']),2)
        self.assertFalse(s['live'])

    def test_original_entry_points_launch_the_native_game(self):
        class Launched(Exception):
            pass
        for command in ['view', 'serve', 'game']:
            with self.subTest(command=command), patch.dict(g, require_game=lambda: None):
                with patch.object(g['os'], 'execvp', side_effect=Launched) as launch:
                    with self.assertRaises(Launched):
                        m['main']([command, str(self.net), '--port', '8768'])
                    launch.assert_called_once_with('node', ['node', str(ROOT/'game/run.mjs'),
                                                           str(self.net), '--port', '8768'])

    def test_many_diplomats_and_finished_status(self):
        self.assertEqual(len(m['colors_for'](['custom-'+str(i) for i in range(80)])),80)
        s=m['parse_status']('height 4 term 2 leader codex\nfinished: done\n')
        self.assertEqual(m['market_title'](s),'Done')

    def test_scripted_roster_agent_is_a_colored_penguin(self):
        d=self.net/'grok';d.mkdir()
        (d/'genesis.json').write_text('{}');(d/'key.json').write_text('{}')
        a=next(a for a in self.state()['agents'] if a['name']=='grok')
        self.assertFalse(a['diplomat'])
        self.assertEqual(a['avatar'],'penguin')
        self.assertEqual(a['color'],m['KIND_COLORS']['grok'])

    def test_http_routes_do_not_expose_network_files(self):
        class Socket:
            def __init__(self, request):
                self.input = io.BytesIO(request)
                self.output = bytearray()
            def makefile(self, *_): return self.input
            def sendall(self, data): self.output.extend(data)
        def request(path, method='GET', headers='', legacy=False):
            sock = Socket(f'{method} {path} HTTP/1.0\r\n{headers}\r\n'.encode())
            m['make_handler'](self.state, str(self.net), legacy=legacy)(sock, ('127.0.0.1', 1234),
                SimpleNamespace(server_address=('127.0.0.1',8767)))
            return bytes(sock.output)
        self.assertIn(b'200 OK',request('/assets/coffee.swl',legacy=True))
        self.assertIn(b'text/javascript',request('/club.js',legacy=True))
        for path in ['/', '/club.js', '/assets/coffee.swl']:
            self.assertIn(b'404 Not Found', request(path))
        for path in ['/claude/key.json','/assets/../../pantheon-club','/assets/../../claude/key.json']:
            self.assertIn(b'404 Not Found',request(path))
        self.assertNotIn(b'NEVER SERVE',request('/state.json'))
        self.assertIn(b'403 Forbidden',request('/focus?agent=codex','POST','Origin: https://example.com\r\n'))

if __name__ == '__main__':
    unittest.main()
