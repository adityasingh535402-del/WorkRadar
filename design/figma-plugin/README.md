# WorkRadar screens: Figma plugin

This development plugin rebuilds all 15 hi-fi WorkRadar screens, plus a cover and design-system frame, as **editable Figma layers**: frames, text with the real Barlow fonts, and vector icons. The radar itself is a vector, not a picture.

The screens were generated from the running app. A headless browser renders each state, a DOM walker (`extract.js`) records every box, text run and icon, and `code.js` replays those records through the Figma Plugin API. The design file therefore matches the shipped product pixel for pixel.

## Run it (about two minutes)

1. Open the **Figma desktop app** and open the WorkRadar design file, or any new design file.
2. Go to **Menu → Plugins → Development → Import plugin from manifest…** and choose `design/figma-plugin/manifest.json` from this repository.
3. Run it from **Plugins → Development → WorkRadar screens**.

The plugin is idempotent: it replaces any frame with the same name, so running it again just refreshes the screens. It makes no network calls.

## Screens

| Row | Frames |
|---|---|
| Core flows | 01 Today · 03 Priority feed · 04 Item detail · 06 Search · 13 Team |
| Interactions & dark mode | 05 Assign (AI-suggested owner) · 07 Command palette · 12 Mark done + Undo · 02 Today (dark) |
| Empty & error states | 08 First run · 09 Nothing needs you · 10 No search results · 11 Source outage + AI unreachable |
| Mobile | 14 Today · 15 Item detail |

PNG exports of every screen are in [`docs/screens/`](../../docs/screens).
