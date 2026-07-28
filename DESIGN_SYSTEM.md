# MillionDollar Brain Design System

**Version:** 1.0
**Status:** Normative MVP visual baseline

## 1. Authority and precedence

This specification makes the accepted editorial mockups part of the normative PRD set.

When sources differ:

1. `PRD.md`, `UX_SCREENS.md`, and protocol data schemas control product behavior, content, and state.
2. This document controls visual language, theme semantics, typography, and accessibility.
3. The accepted mockups control layout hierarchy, density, proportion, and art direction.
4. Generated sample values, company marks, dates, addresses, and wording inside a mockup are illustrative and never override live protocol data or normative copy.

The implementation is not required to reproduce incidental raster artifacts pixel-for-pixel.

## 2. Normative mockups

### Light mode

- `design/mockups/brain-screen-v3-refined.png`
- `design/mockups/basket-screen-v2-editorial.png`
- `design/mockups/decisions-screen-v2-editorial.png`

### Dark mode

- `design/mockups/brain-screen-v3-refined-dark.png`
- `design/mockups/basket-screen-v2-editorial-dark.png`
- `design/mockups/decisions-screen-v2-editorial-dark.png`

The earlier `v1` navy mockups are historical alternatives and are explicitly non-normative.

The implemented Decisions view extends the accepted editorial direction with a left-hand, newest-first cycle archive and a right-hand selected-cycle trace. History rows use compact mono timestamps, source labels, allocation summaries, block numbers, and shortened transaction identifiers; the detail view exposes complete execution hashes and remains the authoritative readable record.

## 3. Brand direction

The product uses an editorial brokerage identity:

- Financial publication rather than generic SaaS.
- Exchange ledger rather than science-fiction terminal.
- Human, tactile, and composed rather than glowing or synthetic.
- Dense information with clear hierarchy rather than decorative emptiness.
- Flat ink colors, thin rules, restrained corners, and minimal shadows.

The following are prohibited in the primary product interface:

- Navy-and-cyan AI-dashboard styling.
- Neon purple.
- Electric glow.
- Glassmorphism.
- Decorative gradients.
- Cyberpunk or science-fiction HUD motifs.
- Floating coin imagery.
- Cartoon or photoreal anatomical brains.
- Unlicensed third-party marks.

## 4. Typography

All fonts are self-hosted as WOFF2 files and licensed under the SIL Open Font License.

| Role              | Font           | Use                                                                              |
| ----------------- | -------------- | -------------------------------------------------------------------------------- |
| Editorial display | Source Serif 4 | Product wordmark, page titles, major insight statements, large financial figures |
| Interface         | Source Sans 3  | Navigation, controls, body text, tables, labels, tooltips                        |
| Technical         | IBM Plex Mono  | Wallet addresses, hashes, contract addresses, cycle IDs, schema values           |

Rules:

- Use tabular numerals for financial values and timestamps.
- Never use the serif face below 16 CSS pixels.
- Body text defaults to 16 pixels with a 1.5 line height.
- Data-table text may use 14 pixels with a 1.35 line height.
- Technical identifiers truncate in the middle and expose the full value through copy and detail controls.
- Font fallback stacks are committed with the implementation.

## 5. Color tokens

Component code consumes semantic CSS variables. Raw palette values must not be scattered through components.

### 5.1 Light mode

| Token              | Value     | Meaning                                 |
| ------------------ | --------- | --------------------------------------- |
| `--background`     | `#F3EFE4` | Main warm-bone canvas                   |
| `--surface`        | `#FFFDF7` | Primary content surface                 |
| `--surface-subtle` | `#E8E0D0` | Parchment grouping surface              |
| `--surface-raised` | `#FAF6EC` | Menus, dialogs, and raised controls     |
| `--text`           | `#20231F` | Primary charcoal ink                    |
| `--text-muted`     | `#5B5E56` | Secondary readable text                 |
| `--border`         | `#B8AC98` | Rules and component boundaries          |
| `--primary`        | `#7A2634` | Oxblood action and brain influence      |
| `--on-primary`     | `#FFF8EC` | Text on primary                         |
| `--positive`       | `#315B49` | Healthy, validated, and positive        |
| `--warning`        | `#8A5A12` | Caution and deterministic adjustment    |
| `--negative`       | `#8B2E2E` | Failure, sell-only, and destructive     |
| `--info`           | `#4F6777` | Ornith proposal and neutral information |
| `--focus`          | `#7A2634` | Keyboard focus ring                     |

### 5.2 Dark mode

| Token              | Value     | Meaning                                 |
| ------------------ | --------- | --------------------------------------- |
| `--background`     | `#191916` | Warm charcoal canvas                    |
| `--surface`        | `#24211C` | Espresso primary surface                |
| `--surface-subtle` | `#302B24` | Dark-umber grouping surface             |
| `--surface-raised` | `#393228` | Menus, dialogs, and raised controls     |
| `--text`           | `#E9E1D2` | Bone primary text                       |
| `--text-muted`     | `#BFB5A4` | Parchment-gray secondary text           |
| `--border`         | `#746755` | Accessible warm boundary                |
| `--primary`        | `#D16670` | Brighter oxblood action and influence   |
| `--primary-fill`   | `#B94F59` | Filled primary control                  |
| `--on-primary`     | `#FFF8EC` | Text on primary fill                    |
| `--positive`       | `#8FB09A` | Healthy, validated, and positive        |
| `--warning`        | `#D1A35A` | Caution and deterministic adjustment    |
| `--negative`       | `#E07A7A` | Failure, sell-only, and destructive     |
| `--info`           | `#9AAEBC` | Ornith proposal and neutral information |
| `--focus`          | `#D16670` | Keyboard focus ring                     |

### 5.3 Data-series colors

The default ordered data-series palette is:

1. Mineral slate: `#657A8A` light, `#9AAEBC` dark.
2. Forest or sage: `#315B49` light, `#8FB09A` dark.
3. Clay: `#A65E46` light, `#C77D65` dark.
4. Ochre: `#8A5A12` light, `#D1A35A` dark.
5. Dusty olive: `#6E754F` light, `#A4AA7A` dark.
6. Faded plum: `#76566F` light, `#A98CA1` dark.

Color never carries meaning alone. Charts also use labels, patterns, shapes, direct values, or line styles.

## 6. Verified contrast baseline

The selected primary combinations were calculated before implementation:

| Pair                                 | Contrast |
| ------------------------------------ | -------: |
| Light text on light background       |  13.83:1 |
| Light muted text on light background |   5.75:1 |
| Light primary on light background    |   8.48:1 |
| Light on-primary text on primary     |   9.23:1 |
| Dark text on dark background         |  13.56:1 |
| Dark muted text on dark background   |   8.69:1 |
| Dark primary text on dark background |   4.90:1 |
| Dark on-primary text on primary fill |   4.60:1 |
| Dark border on dark background       |   3.20:1 |

Automated and manual testing still validates rendered contrast after font weight, opacity, browser rendering, chart layering, and disabled states are applied.

## 7. Theme behavior

- Modes are `Light`, `Dark`, and `System`.
- First visit follows `prefers-color-scheme`.
- A manual selection persists on the device.
- A pre-hydration inline theme initializer applies the stored preference before first paint.
- Server rendering uses a non-breaking default and does not hide meaningful content.
- Theme switching changes presentation only. It never changes protocol state, data, chart series meaning, or transaction behavior.
- Both modes expose identical content and controls.

## 8. Layout and component rules

- Content width is fluid through 1536 pixels, with a readable maximum for long prose.
- Breakpoints are 640, 768, 1024, 1280, and 1536 CSS pixels.
- Spacing uses a four-pixel base grid.
- Standard panel radius is 6 pixels.
- Dialog and drawer radius is 8 pixels.
- Buttons use 4 or 6 pixels and never become pill-shaped unless the control is a compact status.
- Borders do most of the grouping work; shadows are reserved for overlays.
- Dense desktop tables become labeled cards below 768 pixels.
- The 42-piece brain remains an SVG interaction map and never makes raster pixels responsible for hit testing, focus, selection, or ownership state.
- The visual layer uses one continuous anatomically traced lateral-brain SVG silhouette plus 42 individually generated, versioned transparent character portraits. Cerebrum, cerebellum, and brainstem remain semantic placement metadata, but they do not create separate outer outlines or disconnected masks.
- The Brain uses one character-first map rather than a visualization-mode selector. Ownership remains visible through the permanent halo and `Yours` filter; influence and current mood remain explicit in tooltips and the selected-piece inspector.
- The four crew labels below the map are toggle buttons. Activating one brings that crew to full color, strengthens its boundaries, mutes non-members, exposes `aria-pressed`, and clears when activated again.
- Crew identity must never form horizontal catalog-order bands. The presentation manifest uses a fixed visual-slot permutation that scatters every crew across the width and height of the brain while preserving canonical piece IDs.
- Unselected portraits are intentionally subdued. Hover and keyboard focus preview; only click, tap, Enter, or Space commits selection.
- The inspector permanently owns the desktop right rail and Brain Pulse is a compact full-width summary strip. The Brain screen ends after the primary map and inspector; basket information belongs on the dedicated Basket screen.
- The selected-piece portrait is a prominent 104-pixel square on desktop and an
  84-pixel square on mobile. When the connected wallet owns the piece, the
  portrait is the file-picker trigger and clearly states whether that
  ownership's single portrait change remains available.
- Custom portraits use the same map clipping as canonical portraits. The
  application normalizes uploads to transparent-capable 384-by-384 WebP and
  serves them from a content-hash cache-safe URL after the on-chain commitment
  confirms.
- A connected wallet's pieces retain a positive-color double-outline halo on the map. The textual `Yours (n) · double outline` key is interactive: selecting it mutes non-owned pieces like a crew filter, and selecting it again clears the filter. This makes the treatment discoverable and ensures color is not the only ownership signal.
- Mobile provides Map and searchable List views. Zoom is clamped to 1 through 2.5 times inside a native scrolling viewport.
- The map does not overlay piece numbers or generic glyphs on the portraits. Catalog names remain available through accessible labels and the selected-piece ledger.
- The generated art direction and canonical asset paths are defined in `design/brain-art/README.md`.

## 9. Motion

- Motion communicates state change, transaction progress, selection, or spatial continuity.
- Standard duration is 120 to 180 milliseconds.
- Drawers may use up to 240 milliseconds.
- No ambient pulsing, glowing, floating, or decorative looping animation.
- `prefers-reduced-motion` removes nonessential animation and preserves immediate state feedback.

## 10. Accessibility acceptance

- WCAG 2.2 AA is the MVP target.
- Every action is keyboard operable.
- Focus order follows the visible reading order.
- Focus is never indicated by color alone.
- The brain provides roving keyboard navigation, piece names, current presets, ownership, prices, and actions.
- Charts include accessible summaries and underlying tables.
- Status, risk, and trading permissions use text in addition to color.
- Zoom to 200% preserves operation without horizontal scrolling except intentional data tables.
- Both themes pass automated axe checks and manual keyboard, screen-reader, contrast, zoom, and reduced-motion review.
