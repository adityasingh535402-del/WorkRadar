import json, os, glob

HERE = os.path.dirname(__file__)
SPECS = os.path.join(HERE, 'specs')
OUT = os.path.join(HERE, 'calls')
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.js')):
    os.remove(f)

RENDER = r"""
const NS = 'workradar';
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const paint = (c) => (!c ? [] : Array.isArray(c) ? [{ type: 'SOLID', color: rgb(c[0]), opacity: c[1] }] : [{ type: 'SOLID', color: rgb(c) }]);
const fonts = new Map();
const addF = (t) => { const s = S.ts[t]; fonts.set(s[0] + '|' + s[1], { family: s[0], style: s[1] }); };
for (const n of S.n) if (n[0] === 1) { addF(n[6]); if (Array.isArray(n[7])) n[7].forEach((r) => addF(r[1])); }
await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
const page = figma.currentPage;
let screen = page.findChild((x) => x.type === 'FRAME' && x.name === S.name);
if (!screen) {
  screen = figma.createFrame();
  screen.name = S.name;
  screen.resize(S.w, S.h);
  screen.x = S.x; screen.y = S.y;
  screen.fills = paint(S.bg);
  screen.clipsContent = true;
}
const map = new Map();
if (S.start > 0) for (const f of screen.findAllWithCriteria({ types: ['FRAME'], sharedPluginData: { namespace: NS, keys: ['i'] } })) map.set(+f.getSharedPluginData(NS, 'i'), f);
const ALIGN = ['LEFT', 'CENTER', 'RIGHT'];
let made = 0;
for (let k = 0; k < S.n.length; k++) {
  const n = S.n[k];
  const gi = S.start + k;
  const parent = n[1] < 0 ? screen : map.get(n[1]) || screen;
  if (n[0] === 0) {
    const [fill, rad, stroke, fx, clip, op] = S.fs[n[6]];
    const f = figma.createFrame();
    f.name = S.nm[n[7]];
    f.resize(Math.max(n[4], 0.01), Math.max(n[5], 0.01));
    f.fills = paint(fill);
    if (Array.isArray(rad)) { f.topLeftRadius = rad[0]; f.topRightRadius = rad[1]; f.bottomRightRadius = rad[2]; f.bottomLeftRadius = rad[3]; } else if (rad) f.cornerRadius = rad;
    if (stroke) {
      f.strokes = paint(stroke[0]);
      f.strokeAlign = 'INSIDE';
      const w = stroke[1];
      if (w.every((v) => v === w[0])) f.strokeWeight = w[0];
      else { f.strokeTopWeight = w[0]; f.strokeRightWeight = w[1]; f.strokeBottomWeight = w[2]; f.strokeLeftWeight = w[3]; }
    }
    if (fx.length) f.effects = fx.map(([x, y, b, s, c]) => { const col = Array.isArray(c) ? c : [c, 1]; return { type: 'DROP_SHADOW', color: { ...rgb(col[0]), a: col[1] }, offset: { x, y }, radius: b, spread: s, visible: true, blendMode: 'NORMAL' }; });
    f.clipsContent = !!clip;
    if (op < 1) f.opacity = op;
    parent.appendChild(f);
    f.x = n[2]; f.y = n[3];
    f.setSharedPluginData(NS, 'i', String(gi));
    map.set(gi, f);
  } else if (n[0] === 1) {
    const s = S.ts[n[6]];
    const t = figma.createText();
    t.fontName = { family: s[0], style: s[1] };
    const runs = Array.isArray(n[7]) ? n[7] : null;
    t.characters = runs ? runs.map((r) => r[0]).join('') : n[7];
    t.fontSize = s[2];
    t.lineHeight = { unit: 'PIXELS', value: s[3] };
    if (s[4]) t.letterSpacing = { unit: 'PIXELS', value: s[4] };
    t.fills = paint(s[5]);
    t.textAlignHorizontal = ALIGN[s[6]] || 'LEFT';
    if (s[7] === 1) t.textDecoration = 'UNDERLINE';
    if (s[7] === 2) t.textDecoration = 'STRIKETHROUGH';
    if (runs) {
      let at = 0;
      for (const [str, ti] of runs) {
        const rs = S.ts[ti];
        const end = at + str.length;
        if (end > at) {
          t.setRangeFontName(at, end, { family: rs[0], style: rs[1] });
          t.setRangeFontSize(at, end, rs[2]);
          t.setRangeFills(at, end, paint(rs[5]));
          t.setRangeTextDecoration(at, end, rs[7] === 1 ? 'UNDERLINE' : rs[7] === 2 ? 'STRIKETHROUGH' : 'NONE');
        }
        at = end;
      }
    }
    t.name = (runs ? t.characters : n[7]).slice(0, 40);
    parent.appendChild(t);
    const mode = n[8];
    if (mode === 0) { t.textAutoResize = 'WIDTH_AND_HEIGHT'; t.x = n[2]; t.y = n[3]; }
    else if (mode === 4) { t.resize(n[4] + 4, n[5]); t.textAutoResize = 'HEIGHT'; t.x = n[2] - 2; t.y = n[3]; }
    else {
      t.resize(Math.max(n[4] + (mode === 1 ? 1.5 : 0), 1), Math.max(n[5], 1));
      t.textAutoResize = 'HEIGHT';
      if (mode === 2 || mode === 3) { t.textTruncation = 'ENDING'; t.maxLines = mode === 2 ? 1 : Math.max(2, Math.round(n[5] / s[3])); }
      t.x = n[2]; t.y = n[3];
    }
  } else {
    const v = figma.createNodeFromSvg(S.sv[n[6]]);
    v.name = n[4] > 120 ? 'Radar scope' : 'icon';
    parent.appendChild(v);
    v.x = n[2]; v.y = n[3];
  }
  made++;
}
return { screenId: screen.id, made, total: S.start + S.n.length };
"""

LAYOUT = {
    # row, order
    '01': (0, 0), '03': (0, 1), '04': (0, 2), '06': (0, 3), '13': (0, 4),
    '05': (1, 0), '07': (1, 1), '12': (1, 2), '02': (1, 3),
    '08': (2, 0), '09': (2, 1), '10': (2, 2), '11': (2, 3),
    '14': (3, 0), '15': (3, 1),
}
ROW_Y = {0: 400, 1: 2300, 2: 3500, 3: 4800}
GAP = 160
MAX_CODE = 47000

import re as _re
def svgmin(x):
    x = _re.sub(r'<circle [^>]*fill="none" stroke="none"[^>]*></circle>', '', x)
    x = x.replace(' stroke-linecap="butt"', '').replace(' stroke-linejoin="miter"', '').replace(' fill="#000000"', '')
    x = _re.sub(r'(<svg[^>]*?) fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"', r'\1', x)
    x = _re.sub(r'(\d+\.\d)\d+', r'\1', x)
    x = x.replace('.0"', '"').replace('.0 ', ' ')
    x = x.replace('></circle>', '/>').replace('></path>', '/>').replace('></line>', '/>')
    x = x.replace(' xmlns="http://www.w3.org/2000/svg"', '', 0)
    return x
def num(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v
specs = {os.path.basename(p)[:2]: json.load(open(p)) for p in sorted(glob.glob(os.path.join(SPECS, '*.json')))}
for _k, _s in specs.items():
    _s['sv'] = [svgmin(x) for x in _s['sv']]
    _s['nodes'] = [[num(v) for v in n] for n in _s['nodes']]
# x positions per row
row_x = {}
positions = {}
for key in sorted(LAYOUT, key=lambda k: LAYOUT[k]):
    row, order = LAYOUT[key]
    x = row_x.get(row, 0)
    positions[key] = (x, ROW_Y[row])
    row_x[row] = x + specs[key]['w'] + GAP

manifest = []
for key, s in specs.items():
    nodes = s['nodes']
    W, H = s['w'], s['h']
    # absolute → relative coordinates, drop nodes outside the frame
    absx = {}
    keep = []
    remap = {}
    for i, n in enumerate(nodes):
        x, y, w, h = n[2], n[3], n[4], n[5]
        if x + w < 0 or y > H or x > W + 50:
            continue
        p = n[1]
        while p >= 0 and p not in remap:  # parent dropped → attach to its kept ancestor
            p = nodes[p][1]
        px, py = absx.get(p, (0, 0)) if p >= 0 else (0, 0)
        nn = list(n)
        nn[1] = remap[p] if p >= 0 else -1
        nn[2] = num(round(x - px, 1))
        nn[3] = num(round(y - py, 1))
        remap[i] = len(keep)
        if n[0] == 0:
            absx[i] = (x, y)
        keep.append(nn)
    # chunk
    start = 0
    part = 0
    while start < len(keep):
        end = start
        size = 0
        while end < len(keep):
            n = keep[end]
            add = len(json.dumps(n, ensure_ascii=False, separators=(',', ':')))
            if n[0] == 2:
                add += len(s['sv'][n[6]])
            if size + add > MAX_CODE - 9000 and end > start:
                break
            size += add
            end += 1
        chunk = keep[start:end]
        used_sv = sorted({n[6] for n in chunk if n[0] == 2})
        S = {
            'name': s['name'], 'w': W, 'h': H, 'bg': s['bg'] or '#eaefee', 'x': positions[key][0], 'y': positions[key][1],
            'start': start, 'fs': s['fs'], 'ts': s['ts'], 'nm': s['nm'],
            'sv': {str(i): s['sv'][i] for i in used_sv}, 'n': chunk,
        }
        code = 'const S = ' + json.dumps(S, ensure_ascii=False, separators=(',', ':')) + ';\n' + RENDER.strip()
        fn = os.path.join(OUT, f'{key}-{part}.js')
        open(fn, 'w').write(code)
        manifest.append((key, part, len(code), len(chunk)))
        part += 1
        start = end

for m in manifest:
    print(m)
print('calls', len(manifest), 'total chars', sum(m[2] for m in manifest))
open(os.path.join(HERE,'render.js'),'w').write(RENDER.strip())
