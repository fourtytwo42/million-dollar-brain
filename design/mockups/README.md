# MillionDollar Brain Visual Mockups

These ImageGen mockups translate the normative screen map into visual directions. They are implementation references, not pixel-perfect specifications.

## Primary screens

- `brain-screen-v2-editorial.png`: the normative 42-piece brain marketplace, Brain Pulse, basket snapshot, and primary actions.
- `basket-screen-v2-editorial.png`: the normative NAV, allocation, performance, holdings, target drift, and connected-wallet position.
- `decisions-screen-v2-editorial.png`: the normative Brain requested, Ornith proposed, and Protocol executed explanation flow.
- `brain-screen-v2-editorial-dark.png`: dark-mode companion to the Brain screen.
- `basket-screen-v2-editorial-dark.png`: dark-mode companion to the Basket screen.
- `decisions-screen-v2-editorial-dark.png`: dark-mode companion to the Decisions screen.

The original `v1` dark mockups remain for comparison but are non-normative.

## Normative editorial direction

- Warm bone application background.
- Pale parchment panels.
- Charcoal ink navigation, borders, and primary text.
- Oxblood primary actions and brain influence.
- Forest green validated and healthy states.
- Ochre warnings, value accents, and deterministic adjustments.
- Muted slate blue, clay, dusty olive, and faded plum data series.
- Editorial serif headings paired with a compact sans-serif for controls and data.
- Flat fills, thin rules, restrained corners, and subtle paper texture.
- No neon, glow, glassmorphism, or generic dark AI-dashboard treatment.

### Dark mode

- Warm charcoal background rather than blue-black or pure black.
- Espresso and dark-umber surfaces.
- Bone and parchment-gray typography.
- Brighter oxblood, sage, ochre, mineral slate, clay, olive, and faded-plum semantic colors.
- The same typography, hierarchy, borders, spacing, and meaning as light mode.
- No neon, cyan, glow, glassmorphism, gradients, or cyberpunk treatment.

Both modes are requirements. Exact production color tokens and font files must be tested for contrast, licensing, rendering, and accessibility before implementation is considered final.

## Implementation guidance

- Preserve the hierarchy and information relationships rather than copying generated text or numbers literally.
- Implement the brain as the required accessible 42-path SVG.
- Use real protocol state, verified token metadata, and the application design system.
- Do not copy third-party company or token logos from the mockups without verifying usage rights.
- Validate the implemented screens with automated browser tests, the Codex in-app Browser, and Chrome wallet UAT.
