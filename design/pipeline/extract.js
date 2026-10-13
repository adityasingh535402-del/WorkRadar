// Runs inside the page. Walks the rendered DOM and returns a compact, Figma-oriented layout spec.
// Output: { w, h, bg, frames: [...], fs: frameStyles, ts: textStyles, sv: svgs, nm: names, nodes }
(opts) => {
  const maxH = opts.maxH || 1e9;
  const W = document.documentElement.clientWidth;
  const docH = Math.min(Math.max(document.documentElement.scrollHeight, window.innerHeight), maxH);
  const tables = { fs: [], ts: [], sv: [], nm: [] };
  const idx = { fs: new Map(), ts: new Map(), sv: new Map(), nm: new Map() };
  const intern = (t, v) => {
    const k = JSON.stringify(v);
    if (!idx[t].has(k)) {
      idx[t].set(k, tables[t].length);
      tables[t].push(v);
    }
    return idx[t].get(k);
  };
  const nodes = [];
  const rnd = (n) => Math.round(n * 10) / 10;
  const hex = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    const h = '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return a < 1 ? [h, rnd(a)] : h;
  };
  const px = (v) => parseFloat(v) || 0;
  const LANDMARK = /^(sidebar|main|page|today-head|today-hero|today-grid|panel|panel-head|brief|brief-head|brief-body|brief-cols|strip|strip-list|feed-layout|feed-main|views|filters|chips|item-head|item-meta|item-layout|item-main|item-side|team-grid|person-card|blocked-list|blocked-card|actions|nav|nav-item|menu|menu-list|popover|palette|palette-list|toast|toasts|search-box|tabs|understood|scope|why|factors|msgs|msg|timeline|empty|empty-ws|connect-list|banner|mobile-top|mobile-nav|workspace|sources|me|brand|page-head|selects|topwork|happened|related|people|checks|pr-grid|fields|settings-section|radio-cards|weights|sliders|preview|source-settings|demo-actions)$/;
  const nameOf = (el) => {
    const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const main = c.find((x) => LANDMARK.test(x)) || c[0] || el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label');
    if (el.classList.contains('strip')) return 'Strip · ' + (el.querySelector('.strip-ref')?.textContent || '');
    if (el.tagName === 'BUTTON' || el.tagName === 'A') return (main.startsWith('btn') ? 'Button' : main) + (aria ? ' · ' + aria : el.textContent.trim() ? ' · ' + el.textContent.trim().slice(0, 24) : '');
    return main.replace(/-/g, ' ');
  };
  const isTextBlock = (el) => {
    let hasText = false;
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          if (c.textContent.trim()) hasText = true;
        } else if (c.nodeType === 1) {
          const cs = getComputedStyle(c);
          if (cs.display === 'none') continue;
          if (cs.display !== 'inline' || c.tagName === 'svg' || c.tagName === 'IMG' || c.tagName === 'INPUT' || c.tagName === 'KBD') return false;
          if (cs.backgroundColor && hex(cs.backgroundColor) && c.tagName !== 'MARK') return false;
          if (!walk(c)) return false;
        }
      }
      return true;
    };
    return walk(el) && hasText;
  };
  const fontOf = (cs) => {
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const family = /Barlow/.test(fam) ? fam : 'Barlow';
    const wt = +cs.fontWeight;
    let style = wt >= 700 ? 'Bold' : wt >= 600 ? 'SemiBold' : wt >= 500 ? 'Medium' : 'Regular';
    if (cs.fontStyle === 'italic') style = style === 'Regular' ? 'Italic' : style + ' Italic';
    return [family, style];
  };
  const lineH = (cs) => (cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight));
  const textStyle = (cs, align) => {
    const [family, style] = fontOf(cs);
    const col = hex(cs.color) || '#000000';
    const dec = cs.textDecorationLine.includes('underline') ? 1 : cs.textDecorationLine.includes('line-through') ? 2 : 0;
    return intern('ts', [family, style, rnd(px(cs.fontSize)), rnd(lineH(cs)), rnd(px(cs.letterSpacing) || 0), col, align || 0, dec, cs.textTransform === 'uppercase' ? 1 : 0]);
  };
  const ALIGN = { left: 0, start: 0, center: 1, right: 2, end: 2, justify: 0 };

  function addNode(n) {
    nodes.push(n);
    return nodes.length - 1;
  }

  function frameFor(el, cs, r, parent, extra = {}) {
    const fill = hex(cs.backgroundColor);
    const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => Math.min(/%$/.test(v) ? (parseFloat(v) / 100) * Math.min(r.width, r.height) : px(v), Math.min(r.width, r.height) / 2)).map(rnd);
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(px);
    const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(hex);
    let stroke = null;
    const maxW = Math.max(...bw);
    if (maxW > 0) {
      const i = bw.indexOf(maxW);
      if (bc[i]) stroke = [bc[i], bw.map((w, j) => (bc[j] ? rnd(w) : 0))];
    }
    const effects = [];
    const bands = [];
    const sh = cs.boxShadow;
    if (sh && sh !== 'none') {
      // split on commas not inside parentheses
      const parts = sh.split(/,(?![^(]*\))/);
      for (const p of parts) {
        const col = (p.match(/rgba?\([^)]+\)/) || [])[0];
        const nums = p.replace(/rgba?\([^)]+\)/, '').replace('inset', '').trim().split(/\s+/).map(px);
        const inset = p.includes('inset');
        const [x, y, blur, spread] = [nums[0] || 0, nums[1] || 0, nums[2] || 0, nums[3] || 0];
        const c = hex(col);
        if (!c) continue;
        if (inset && blur === 0 && spread === 0 && (x || y)) bands.push([x > 0 ? 'L' : y > 0 ? 'T' : 'B', Math.abs(x || y), c]);
        else if (blur === 0 && spread > 0) stroke = stroke ? [stroke[0], stroke[1].map((w) => w + spread)] : [c, [spread, spread, spread, spread]];
        else if (!inset && blur > 0) effects.push([x, y, blur, spread, c]);
      }
    }
    const clip = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'auto' ? 1 : 0;
    const op = +cs.opacity < 1 ? rnd(+cs.opacity) : 1;
    const st = intern('fs', [fill, radii.every((v) => v === radii[0]) ? radii[0] : radii, stroke, effects, clip, op]);
    const name = intern('nm', extra.name || nameOf(el));
    const i = addNode([0, parent, rnd(r.left + scrollX), rnd(r.top + scrollY), rnd(r.width), rnd(r.height), st, name]);
    for (const [side, size, c] of bands) {
      const bst = intern('fs', [c, 0, null, [], 0, 1]);
      const bn = intern('nm', 'band');
      const bx = side === 'L' ? r.left : r.left;
      const by = side === 'B' ? r.bottom - size : r.top;
      addNode([0, i, rnd(bx + scrollX), rnd(by + scrollY), side === 'L' ? size : rnd(r.width), side === 'L' ? rnd(r.height) : size, bst, bn]);
    }
    return i;
  }

  function serializeSvg(svg) {
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((s, k) => {
      const d = dst[k];
      const cs = getComputedStyle(s);
      if (cs.display === 'none') {
        d.remove();
        return;
      }
      const set = (attr, v) => v && v !== 'none' && d.setAttribute(attr, v);
      const colorAttr = (v) => {
        if (!v || v === 'none') return 'none';
        const h = hex(v);
        return h ? (Array.isArray(h) ? h[0] : h) : 'none';
      };
      const alpha = (v) => {
        const h = hex(v);
        return Array.isArray(h) ? h[1] : null;
      };
      if (k > 0 || true) {
        const tag = s.tagName.toLowerCase();
        if (['path', 'circle', 'line', 'rect', 'text', 'polygon', 'polyline', 'ellipse'].includes(tag)) {
          const f = colorAttr(cs.fill);
          d.setAttribute('fill', f);
          if (alpha(cs.fill)) d.setAttribute('fill-opacity', alpha(cs.fill));
          const sc = colorAttr(cs.stroke);
          d.setAttribute('stroke', sc);
          if (sc !== 'none') {
            d.setAttribute('stroke-width', px(cs.strokeWidth) || 1);
            if (alpha(cs.stroke)) d.setAttribute('stroke-opacity', alpha(cs.stroke));
            if (cs.strokeDasharray && cs.strokeDasharray !== 'none') d.setAttribute('stroke-dasharray', cs.strokeDasharray.replace(/px/g, ''));
            set('stroke-linecap', cs.strokeLinecap);
            set('stroke-linejoin', cs.strokeLinejoin);
          }
          if (+cs.opacity < 1) d.setAttribute('opacity', cs.opacity);
          if (+cs.strokeOpacity < 1 && sc !== 'none') d.setAttribute('stroke-opacity', cs.strokeOpacity);
          if (tag === 'text') {
            d.setAttribute('font-family', 'Barlow Condensed');
            d.setAttribute('font-size', px(cs.fontSize));
            d.setAttribute('font-weight', cs.fontWeight);
          }
        }
        d.removeAttribute('class');
        d.removeAttribute('style');
        d.removeAttribute('aria-label');
        d.removeAttribute('href');
        d.removeAttribute('role');
        d.removeAttribute('aria-hidden');
        d.removeAttribute('focusable');
        if (s.classList && s.classList.contains('scope-sweep')) d.setAttribute('transform', 'rotate(-38 200 200)');
        if (s.style && s.style.opacity) d.setAttribute('opacity', s.style.opacity);
      }
    });
    // <a> is not valid for Figma's SVG import; turn into groups.
    clone.querySelectorAll('a').forEach((a) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      while (a.firstChild) g.appendChild(a.firstChild);
      a.replaceWith(g);
    });
    clone.querySelectorAll('defs').forEach((d) => d.remove());
    const r = svg.getBoundingClientRect();
    clone.setAttribute('width', rnd(r.width));
    clone.setAttribute('height', rnd(r.height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return clone.outerHTML.replace(/\s+/g, ' ').replace(/(\d+\.\d{2})\d+/g, '$1');
  }

  function textFromRange(node, el, parent) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) return;
    const r = range.getBoundingClientRect();
    if (r.top + scrollY > maxH) return;
    const cs = getComputedStyle(el);
    const lh = lineH(cs);
    const lines = new Set(rects.map((x) => Math.round(x.top))).size;
    const trunc = cs.textOverflow === 'ellipsis' ? 2 : 0;
    const clamp = +cs.webkitLineClamp || 0;
    const align = ALIGN[cs.textAlign] || 0;
    let text = node.textContent.replace(/\s+/g, ' ');
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    if (!text.trim()) return;
    const host = el.closest('.strip-title, .strip-why > span, .strip-ref, .scope-caption-title, .palette-label, .preview-title, .person-items a, .menu-item-title');
    const box = host && (getComputedStyle(host).textOverflow === 'ellipsis' || +getComputedStyle(host).webkitLineClamp) ? host.getBoundingClientRect() : null;
    const ts = textStyle(cs, align);
    let mode = lines > 1 ? 1 : 0;
    let x = r.left, y = r.top, w = r.width, h = r.height;
    const overflowing = host ? host.scrollWidth > host.clientWidth + 1 || host.scrollHeight > host.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
    if (box && overflowing) {
      const hcs = getComputedStyle(host);
      mode = +hcs.webkitLineClamp > 1 ? 3 : 2;
      x = box.left; w = box.width; y = box.top; h = box.height;
    } else if (trunc && overflowing) mode = 2;
    if (clamp > 1) mode = 3;
    // Center line box vertically on the glyph rect height.
    if (mode === 0 || mode === 2) {
      y = y + (h - lh * (mode === 2 && box ? Math.max(1, Math.round(h / lh)) : 1)) / 2;
      h = lh;
    }
    addNode([1, parent, rnd(x + scrollX), rnd(y + scrollY), rnd(w), rnd(h), ts, text.trim() === text ? text : text.trim(), mode]);
  }

  function textBlock(el, cs, parent) {
    // One Figma text node with styled runs for the whole inline block.
    const runs = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          let t = c.textContent.replace(/\s+/g, ' ');
          if (!t) continue;
          const pcs = getComputedStyle(c.parentElement);
          if (pcs.textTransform === 'uppercase') t = t.toUpperCase();
          const link = c.parentElement.closest('.status-link');
          const tsi = textStyle(pcs, ALIGN[cs.textAlign] || 0);
          runs.push([t, link ? intern('ts', tables.ts[tsi].map((v, k) => (k === 7 ? 1 : v))) : tsi]);
        } else if (c.nodeType === 1 && getComputedStyle(c).display !== 'none') walk(c);
      }
    };
    walk(el);
    // trim
    if (runs.length) {
      runs[0][0] = runs[0][0].replace(/^\s+/, '');
      runs[runs.length - 1][0] = runs[runs.length - 1][0].replace(/\s+$/, '');
    }
    const full = runs.map((x) => x[0]).join('');
    if (!full.trim()) return;
    const r = el.getBoundingClientRect();
    if (r.top + scrollY > maxH) return;
    const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth);
    const pr = px(cs.paddingRight) + px(cs.borderRightWidth);
    const pt = px(cs.paddingTop) + px(cs.borderTopWidth);
    const pb = px(cs.paddingBottom) + px(cs.borderBottomWidth);
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0);
    const lines = new Set(rects.map((x) => Math.round(x.top))).size;
    const tr = range.getBoundingClientRect();
    const lh = lineH(cs);
    const clamp = +cs.webkitLineClamp || 0;
    const ell = cs.textOverflow === 'ellipsis';
    const over = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    let mode = clamp > 1 && over ? 3 : ell && over ? 2 : lines > 1 ? 1 : 0;
    let x, y, w, h;
    if (mode === 0) {
      x = tr.left; w = tr.width; h = lh; y = tr.top + (tr.height - lh) / 2;
      if ((ALIGN[cs.textAlign] || 0) !== 0) { x = r.left + pl; w = r.width - pl - pr; mode = 4; }
    } else {
      x = r.left + pl; w = r.width - pl - pr; y = r.top + pt; h = r.height - pt - pb;
    }
    const content = runs.length === 1 ? runs[0][0] : runs;
    const ts = runs.length === 1 ? runs[0][1] : textStyle(cs, ALIGN[cs.textAlign] || 0);
    addNode([1, parent, rnd(x + scrollX), rnd(y + scrollY), rnd(w), rnd(h), ts, content, mode]);
  }

  function walk(el, parent) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.top + scrollY > maxH) return;
    if (r.width === 0 && r.height === 0 && cs.position !== 'fixed') {
      // still walk children (e.g. display:contents)
    }
    const tag = el.tagName;
    if (tag === 'svg' || el instanceof SVGSVGElement) {
      if (r.width < 1) return;
      const s = serializeSvg(el);
      addNode([2, parent, rnd(r.left + scrollX), rnd(r.top + scrollY), rnd(r.width), rnd(r.height), intern('sv', s)]);
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    const fill = hex(cs.backgroundColor);
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((s) => px(cs[`border${s}Width`]) > 0 && hex(cs[`border${s}Color`]));
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    const cls = (el.getAttribute('class') || '').split(/\s+/);
    const landmark = cls.some((c) => LANDMARK.test(c));
    let me = parent;
    if (fill || hasBorder || hasShadow || landmark || el === opts.rootEl) me = frameFor(el, cs, r, parent);

    // Special decorations
    if (el.classList.contains('status-link')) {
      const rects = [...el.getClientRects()];
      for (const rr of rects) {
        const st = intern('fs', [hex(cs.color), 0, null, [], 0, 1]);
        addNode([0, me === parent ? parent : me, rnd(rr.left + scrollX), rnd(rr.bottom - 2 + scrollY), rnd(rr.width), 2, st, intern('nm', 'underline')]);
      }
    }
    if (el.classList.contains('ring-header')) {
      const b = getComputedStyle(el, '::before');
      const st = intern('fs', [hex(b.backgroundColor), 5, b.boxShadow !== 'none' ? [hex((b.boxShadow.match(/rgba?\([^)]+\)/) || [])[0]) || '#cccccc', [1.5, 1.5, 1.5, 1.5]] : null, [], 0, 1]);
      addNode([0, me, rnd(r.left + scrollX), rnd(r.top + r.height / 2 - 5 + scrollY), 10, 10, st, intern('nm', 'ring dot')]);
    }

    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (el.type === 'range') {
        const pct = (el.value - el.min) / (el.max - el.min);
        const track = intern('fs', ['#c9d3d2', 2, null, [], 0, 1]);
        const fillS = intern('fs', [hex(getComputedStyle(document.body).color) || '#12282f', 2, null, [], 0, 1]);
        addNode([0, me, rnd(r.left + scrollX), rnd(r.top + r.height / 2 - 2 + scrollY), rnd(r.width), 4, track, intern('nm', 'slider track')]);
        addNode([0, me, rnd(r.left + scrollX), rnd(r.top + r.height / 2 - 2 + scrollY), rnd(r.width * pct), 4, fillS, intern('nm', 'slider fill')]);
        addNode([0, me, rnd(r.left + r.width * pct - 8 + scrollX), rnd(r.top + r.height / 2 - 8 + scrollY), 16, 16, intern('fs', [hex(getComputedStyle(document.body).color) || '#12282f', 8, null, [], 0, 1]), intern('nm', 'slider thumb')]);
        return;
      }
      if (el.type === 'radio' || el.type === 'checkbox') return;
      const val = tag === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value || el.placeholder;
      if (val) {
        const ts = textStyle(el.value || tag === 'SELECT' ? cs : { ...cs, color: getComputedStyle(el, '::placeholder').color, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle, fontSize: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textDecorationLine: 'none', textTransform: 'none', textAlign: cs.textAlign }, 0);
        const lh = lineH(cs);
        addNode([1, me, rnd(r.left + px(cs.paddingLeft) + scrollX), rnd(r.top + (r.height - lh) / 2 + scrollY), rnd(r.width - px(cs.paddingLeft) - px(cs.paddingRight)), rnd(lh), ts, val, 2]);
      }
      return;
    }

    if (isTextBlock(el) && el.childNodes.length) {
      textBlock(el, cs, me);
      return;
    }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        if (c.textContent.trim()) textFromRange(c, el, me);
      } else if (c.nodeType === 1) walk(c, me);
    }
  }

  const root = document.querySelector(opts.root || '#root');
  opts.rootEl = root.firstElementChild;
  const bodyBg = hex(getComputedStyle(document.body).backgroundColor);
  // Root container plus portaled overlays (popovers, palette) that live directly in <body>.
  walk(root, -1);
  for (const el of document.body.children) if (el !== root && el.tagName !== 'SCRIPT') walk(el, -1);
  return { w: W, h: Math.round(docH), bg: bodyBg, ...tables, nodes };
};
