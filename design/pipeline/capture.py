import asyncio, json, sys, os, time
from playwright.async_api import async_playwright

HERE = os.path.dirname(__file__)
EXTRACT = open(os.path.join(HERE, 'extract.js')).read()
BASE = 'http://localhost:4174/WorkRadar.html'
OUT = os.path.join(HERE, 'specs')
os.makedirs(OUT, exist_ok=True)

NOW_IDS = ['wr-101', 'wr-102', 'wr-103', 'wr-104', 'wr-105', 'wr-117']

# The design screens show a real Gemini brief, recorded from the live /api/digest route.
FIXTURE = json.load(open(os.path.join(HERE, 'fixtures', 'gemini-brief.json')))
GEMINI_DOWN = {'error': 'gemini-3.5-flash-lite: Gemini 503: The model is overloaded. Please try again later.; gemini-3.8-flash: No answer after 75 seconds.'}


def digest_reply(fail):
    if fail:
        return GEMINI_DOWN
    now = time.time() * 1000
    brief = {k: v for k, v in FIXTURE.items() if not k.startswith('_') and k != 'model'}
    brief['happened'] = [
        {'text': h['text'], 'itemId': h['itemId'], 'at': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime((now - h['agoMin'] * 60000) / 1000))}
        for h in FIXTURE['happened']
    ]
    return {'brief': brief, 'engine': 'gemini', 'model': FIXTURE['model']}

def persisted(**kw):
    data = {'overrides': {}, 'settings': {'weights': {'urgency': 30, 'impact': 25, 'blocking': 20, 'waiting': 15, 'staleness': 5, 'escalation': 5}, 'aiMode': 'auto', 'theme': 'system', 'outage': None}, 'recentSearches': ['waiting on me', 'launchpad'], 'demo': 'live'}
    for k, v in kw.items():
        if k == 'settings':
            data['settings'].update(v)
        else:
            data[k] = v
    return data

SCREENS = [
    # name, width, height(viewport), maxH, scheme, hash, persisted, action, freeze_fixed
    dict(name='01 · Today (dashboard)', w=1440, vh=900, maxH=1560, hash='#/', state=persisted()),
    dict(name='02 · Today · Dark', w=1440, vh=900, maxH=900, hash='#/', state=persisted(settings={'theme': 'dark'})),
    dict(name='03 · Priority feed', w=1440, vh=900, maxH=1500, hash='#/feed', state=persisted()),
    dict(name='04 · Item detail', w=1440, vh=900, maxH=1300, hash='#/item/wr-102', state=persisted()),
    dict(name='05 · Assign (AI-suggested owner)', w=1440, vh=900, maxH=900, hash='#/item/wr-103', state=persisted(), action='assign', fixed=True),
    dict(name='06 · Search', w=1440, vh=900, maxH=1000, hash='#/search?q=launchpad', state=persisted()),
    dict(name='07 · Command palette (⌘K)', w=1440, vh=900, maxH=900, hash='#/', state=persisted(), action='palette', fixed=True),
    dict(name='08 · Empty · First run', w=1440, vh=900, maxH=900, hash='#/', state=persisted(demo='empty'), fixed=True),
    dict(name='09 · Empty · Nothing needs you', w=1440, vh=900, maxH=900, hash='#/feed?view=attention', state=persisted(overrides={i: {'status': 'done', 'doneAt': 'NOW'} for i in NOW_IDS}), fixed=True),
    dict(name='10 · Empty · No search results', w=1440, vh=900, maxH=900, hash='#/search?q=quarterly%20okrs', state=persisted(), fixed=True),
    dict(name='11 · Error · Source outage + AI unreachable', w=1440, vh=900, maxH=1000, hash='#/', state=persisted(settings={'outage': 'jira'}), gemini_down=True),
    dict(name='12 · Mark done + Undo', w=1440, vh=900, maxH=900, hash='#/feed', state=persisted(), action='done', fixed=True),
    dict(name='13 · Team', w=1440, vh=900, maxH=1100, hash='#/team', state=persisted()),
    dict(name='14 · Mobile · Today', w=390, vh=844, maxH=1720, hash='#/', state=persisted(), mobile=True),
    dict(name='15 · Mobile · Item detail', w=390, vh=844, maxH=1500, hash='#/item/wr-101', state=persisted(), mobile=True),
]

async def capture(p, s):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': s['w'], 'height': s['vh']}, device_scale_factor=1, color_scheme='light')
    state = json.dumps(s['state']).replace('"NOW"', 'new Date().toISOString()')
    await ctx.add_init_script(f"try {{ const s = {json.dumps(s['state'])}; for (const k in s.overrides) if (s.overrides[k].doneAt === 'NOW') s.overrides[k].doneAt = new Date(Date.now() - 20*60000).toISOString(); localStorage.setItem('workradar:v1', JSON.stringify(s)); sessionStorage.clear(); }} catch (e) {{}}")
    page = await ctx.new_page()
    reply = json.dumps(digest_reply(s.get('gemini_down')))
    await page.route('**/api/digest', lambda route: route.fulfill(status=200, content_type='application/json', body=reply))
    await page.goto(BASE + s['hash'])
    await page.wait_for_timeout(1800)
    act = s.get('action')
    if act == 'assign':
        await page.click('.item-head [data-action="assign"]')
        await page.wait_for_timeout(400)
    elif act == 'palette':
        await page.keyboard.press('Control+k')
        await page.wait_for_timeout(200)
        await page.keyboard.type('launch')
        await page.wait_for_timeout(300)
    elif act == 'done':
        await page.mouse.move(700, 450)
        await page.keyboard.press('j')
        await page.keyboard.press('j')
        await page.wait_for_timeout(200)
        await page.keyboard.press('e')
        await page.wait_for_timeout(500)
    css = '*{animation:none!important;transition:none!important} .popover,.palette,.toast{animation:none!important}'
    if not s.get('fixed'):
        css += f" .sidebar{{position:absolute!important;height:{s['maxH']}px!important}} .app{{position:relative}}"
    if s.get('mobile'):
        css += f" .mobile-nav{{position:absolute!important;top:{s['maxH'] - 62}px!important;bottom:auto!important}} .mobile-top{{position:absolute!important;top:0!important;left:0;right:0}} .main{{padding-top:72px!important}}"
    await page.add_style_tag(content=css)
    await page.wait_for_timeout(150)
    spec = await page.evaluate(EXTRACT, {'maxH': s['maxH'], 'root': '#root'})
    spec['h'] = min(spec['h'], s['maxH']) if s.get('fixed') else s['maxH'] if spec['h'] >= s['maxH'] else spec['h']
    spec['name'] = s['name']
    fn = os.path.join(OUT, s['name'].split(' ')[0] + '.json')
    json.dump(spec, open(fn, 'w'), separators=(',', ':'), ensure_ascii=False)
    await page.screenshot(path=fn.replace('.json', '.png'), full_page=True, clip={'x': 0, 'y': 0, 'width': s['w'], 'height': min(spec['h'], 1800)})
    await b.close()
    return s['name'], len(spec['nodes']), os.path.getsize(fn)

async def main():
    only = sys.argv[1:]
    async with async_playwright() as p:
        for s in SCREENS:
            if only and s['name'].split(' ')[0] not in only:
                continue
            print(await capture(p, s))

asyncio.run(main())
