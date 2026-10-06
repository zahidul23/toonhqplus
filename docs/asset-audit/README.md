# ToonHQ+ asset size audit

Measured the current `.output/chrome-mv3` production build. All sizes below use decimal KB/MB. This audit does not change production assets or build configuration. The numbered notification icon experiments under `docs/` are not currently packaged.

## Package contents

| Type | Unpacked size | Sum of ZIP-style deflated sizes |
| --- | ---: | ---: |
| JavaScript | 2,344.0 KB | 425.8 KB |
| Images | 1,239.2 KB | 1,237.2 KB |
| CSS | 135.7 KB | 22.1 KB |
| Fonts | 4.9 KB | 3.6 KB |
| HTML and manifest | 2.3 KB | 1.2 KB |
| Total | 3,726.1 KB | 1,689.9 KB |

Deflated totals are an archive-size estimate and exclude ZIP headers. Existing images barely shrink when zipped. The misleadingly named `chunks/logo-32-*.js` is primarily React/ReactDOM runtime code, not a 561 KB logo.

## Public assets

| Group | Files | Size | Same-dimension WebP q85 size, where measured |
| --- | ---: | ---: | ---: |
| Status effects | 9 | 326.3 KB | 92.9 KB |
| Unite images | 10 | 229.3 KB | 102.1 KB |
| Boss and Skelecog artwork | 8 | 174.7 KB | Already WebP |
| Reward category images | 7 | 173.5 KB | 32.1 KB |
| SOS portraits | 32 | 133.7 KB | Already WebP |
| Extension icons and promotional image | 6 | 112.9 KB | Keep manifest icons in PNG |
| Cog suit emblems | 4 | 51.0 KB | 39.9 KB |
| Shticker Book artwork | 5 | 24.7 KB | Already WebP |
| Trashcan images | 2 | 12.1 KB | 2.7 KB |
| Number fonts | 2 | 4.9 KB | Not a worthwhile size target |
| Other public files (`vue-logger.js`, `wxt.svg`) | 2 | 19.6 KB | — |

## Opportunities

1. **Production JavaScript minification:** `wxt.config.ts` explicitly sets `minify: false`. Transforming current built JS/CSS with esbuild saves 1,304.3 KB unpacked and an estimated 133.6 KB after deflation. A real production rebuild must be tested before adopting this. The public `vue-logger.js` needs its own minification step because it is copied as-is.
2. **WebP q85 conversion of non-manifest PNG groups:** status effects save 233.3 KB; Unite images save 127.3 KB; reward category images save 141.4 KB; suit emblems save 11.1 KB; trashcans save 9.4 KB. Combined: 522.5 KB, preserving dimensions and transparency. These are lossy conversions and need visual review plus updated file references and notification checks.
3. **Unused public files:** no source references were found for `icon/promo-small-440x280.png` (53.3 KB), `icon/logo-34.png` (3.7 KB), or `wxt.svg` (1.1 KB). Excluding them saves 58.1 KB. Keep the promotional image outside `public/` for store submission. Dynamically selected SOS/Gag-Up images are used despite having no literal filename references; they must not be removed based on simple text searches.
4. **PNG re-encoding of manifest icons:** `logo-128.png` shrinks from 44.5 KB to 11.3 KB; `logo-48.png` from 7.1 KB to 3.0 KB; `logo-32.png` from 3.3 KB to 1.9 KB. These three together save 38.7 KB. Re-encoding the 16-pixel PNG makes it larger, so retain it. Validate decoded pixels when implementing.
5. **Right-size selected images:** status icons are 256×256 but appear at 20–32 CSS pixels. At 96×96/q85, the tenure icon shrinks from 46.3 KB to 3.7 KB. Skelecog art is 512×512; the Cashbot example shrinks from 38.8 KB to 8.2 KB at 256×256/q85. These example savings overlap the format-conversion savings, so do not add them twice. Check high-DPI displays and all uses before downsizing.
6. **Avoid duplicate imported logo data:** six files under `assets/` duplicate files under `public/icon/`, but most source copies are not packaged. The imported 32-pixel logo is inlined in a JS chunk while the manifest also packages its PNG. Referencing the existing public icon avoids a small duplicate; deleting every source duplicate would not save the summed source bytes from the extension.

The nine proposed q85 numbered notification icons add 132.3 KB. The five PNG conversion groups alone save 522.5 KB, which more than offsets that addition.

Remote ToonHQ images, Toontown rendition portraits, and site fonts are fetched at runtime and do not contribute image/font bytes to the extension package. Their URL strings remain in JavaScript. `node_modules`, development builds, screenshots, and the `docs/` experiments also are not part of this extension build.

`sizes.json` contains every public asset's dimensions, size, reference hints, and tested encoding sizes. `additional-checks.json` contains minification totals, PNG re-encoding results, and resize examples. Literal references are hints, not proof of usage or non-usage.
