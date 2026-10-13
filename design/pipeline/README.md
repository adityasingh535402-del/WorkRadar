# App → Figma pipeline

These scripts turn the running app into editable Figma layers. They produced the WorkRadar design file and the plugin in [`../figma-plugin`](../figma-plugin).

```bash
npm run build:single                                     # dist-single/WorkRadar.html
python3 -m http.server 4174 --directory dist-single &    # serve it
python3 design/pipeline/capture.py                       # Playwright renders 15 states → specs/*.json + *.png
python3 design/pipeline/gen.py                           # compact specs → calls/*.js (≤ 38 KB chunks for the Figma MCP)
python3 design/pipeline/plugin.py                        # bundle every spec + renderer → design/figma-plugin/code.js
```

- `extract.js` runs in the page. It walks the DOM and records each visible box (fill, radius, per-side borders, shadow, clipping), each text run (font, size, line height, colour, decoration, truncation) and each inline SVG.
- `capture.py` seeds app state for each screen through `localStorage` and URL routes, then opens menus and toasts, and calls the extractor.
- `gen.py` converts the records to relative coordinates and de-duplicates styles. Its renderer recreates them with the Figma Plugin API.
- `plugin.py` bundles everything into a development plugin, so the design file can be rebuilt without API limits.

Requires Python 3 with Playwright and a Chromium build.
