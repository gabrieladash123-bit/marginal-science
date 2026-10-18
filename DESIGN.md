# Marginal interface

## Scene
A researcher reviews a manuscript on a laptop in a bright library, while a hiring manager can inspect the system in a few minutes. Use a light, readable workspace.

## System
Product register with the restrained Stitch system. Compact top navigation rather than a permanent sidebar. Two working surfaces: manuscript and analysis/review panel. Model report and architecture are separate tabs, with actual data and clear navigation.

## Tokens
- Canvas: oklch(97.4% 0.004 160)
- Surface: oklch(100% 0 0)
- Ink: oklch(26% 0.015 160)
- Secondary: oklch(48% 0.014 160)
- Border: oklch(89% 0.008 160)
- Action: oklch(43% 0.085 160)
- Action tint: oklch(95% 0.025 160)
- Caution: oklch(48% 0.105 65), with a pale tint and text label
- Type: Geist for UI; Source Serif 4 only for the manuscript; Geist Mono for measured values.
- Radius: 8px controls, 12px major surfaces. Hairline borders, no decorative shadows.
- Layout: 1320px maximum, 32px desktop gutter, 20px mobile gutter, 8px spacing scale.

## Interaction
Analyze is the main action. Editing invalidates old results. Revisions show exact before/after changes and preserve an undo snapshot. A running local model has download progress and cancellation. Empty/error states give an actionable recovery path. Motion uses opacity/transform at 160ms and respects reduced motion.

## References
Phoenix's separation of datasets, evaluations, and experiments informs the model report. Scientific typesetting informs the paper surface; the app chrome remains a compact familiar product interface.
