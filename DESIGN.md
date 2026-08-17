# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-17
- Primary product surfaces: HiPHI project page (`index.html`, `full.html`, `simple.html`) and the separately scoped offline Motion Viewer (`viewer/`).
- Evidence reviewed: `index.html`, `simple.html`, `static/css/hiphi.css`, `static/css/simple.css`, `static/js/main.js`, and the assets under `static/`.

## Brand
- Personality: Academic, precise, optimistic, and technically credible.
- Trust signals: Direct paper/code/dataset links, exact dataset metrics, working interactive previews, clear licensing, and restrained claims.
- Avoid: Generic corporate landing-page patterns, unsupported claims, identity-sensitive media, and new visual styles that compete with the HiPHI wordmark.

## Product goals
- Goals: Explain the HiPHI contribution quickly, give researchers direct access to project resources, and make motion coverage and interaction quality inspectable.
- Non-goals: Hosting the full dataset or replacing the offline Motion Viewer.
- Success signals: Visitors can identify the contribution and reach code, paper, data, organization, and viewer resources from the cover without searching.

## Personas and jobs
- Primary personas: Paper reviewers, motion-learning researchers, humanoid researchers, dataset users, and prospective collaborators.
- User jobs: Understand the benchmark, inspect representative motion, evaluate coverage and quality, and open the relevant research artifact.
- Key contexts of use: Desktop review, mobile link sharing, and presentation/demo viewing.

## Information architecture
- Primary navigation: Overview, Motion Atlas, Frame-LU, Object Interaction, G1 Retargeting, Benchmark, and Release.
- Core routes/screens: The full one-page project site, the simplified project page, and embedded static interactives.
- Content hierarchy: Wordmark and paper title, research-resource links, summary, evidence/interactive sections, benchmark, and release details.

## Design principles
- Lead with the research contribution and the canonical resource links.
- Reuse established typography, color, pill controls, cards, and spacing before adding variants.
- Keep dense technical evidence below a clear and calm cover.
- Tradeoffs: Prefer static, dependency-free delivery and fast scanning over application-like navigation or ornamental motion.

## Visual language
- Color: Warm white background, dark ink, and the existing purple-to-pink HiPHI accent gradient.
- Typography: Inter-compatible system sans serif with strong display headlines and compact supporting copy.
- Spacing/layout rhythm: Wide centered sections, generous vertical breathing room, and responsive wrapping for compact controls.
- Shape/radius/elevation: Pill links and softly elevated rounded cards using existing CSS variables.
- Motion: Short hover transitions; no essential information depends on animation.
- Imagery/iconography: Anonymized motion previews, technical figures, and lightweight labels; avoid adding icon dependencies for familiar resource names.

## Components
- Existing components to reuse: `.btn`, `.hero-actions`, navigation pills, cards, metric chips, video frames, and interactive iframe shells.
- New/changed components: The cover gains a centered, wrapping project-resource link group using the existing button component.
- Variants and states: One primary link and neutral secondary links; hover and keyboard-focus states must remain visible.
- Token/component ownership: Shared full-page components live in `static/css/hiphi.css`; simplified-page equivalents live in `static/css/simple.css`.

## Accessibility
- Target standard: WCAG 2.1 AA where practical for this static site.
- Keyboard/focus behavior: All links remain native anchors with a visible `:focus-visible` treatment.
- Contrast/readability: Use existing ink, white, and accent colors; do not place body copy in gradient text.
- Screen-reader semantics: Group resource links in a labelled navigation landmark and retain descriptive link text.
- Reduced motion and sensory considerations: Interactions remain usable without hover or animation.

## Responsive behavior
- Supported breakpoints/devices: Modern desktop and mobile browsers; existing breakpoints at 1180/1100px and below remain authoritative.
- Layout adaptations: Resource buttons wrap and remain centered instead of shrinking labels or overflowing.
- Touch/hover differences: Pill links keep a minimum touch height; hover effects are decorative only.

## Interaction states
- Loading: Static resource links render immediately; data-driven sections retain their existing loading behavior.
- Empty: Not applicable to the cover links.
- Error: Failed external destinations are controlled by the destination; links must still expose their URLs normally.
- Success: Standard browser navigation in a new tab.
- Disabled: Placeholder links remain enabled and temporarily target the repository.
- Offline/slow network: The page shell and local assets remain usable; external resources naturally require connectivity.

## Content voice
- Tone: Concise, factual, research-oriented, and specific.
- Terminology: Use `GitHub`, `arXiv`, `Dataset`, `ModalityNet`, `Online Viewer`, `Frame-LU`, `BVH`, and `HOI` consistently.
- Microcopy rules: Prefer short noun labels for resource buttons and avoid release promises that are no longer current.

## Implementation constraints
- Framework/styling system: Plain HTML, CSS, and JavaScript; no build step.
- Design-token constraints: Extend the existing CSS variables and components; do not add a new design-system layer.
- Performance constraints: No new runtime dependency, font request, or icon package for project links.
- Compatibility constraints: Preserve the static hosting model and relative local asset paths.
- Test/screenshot expectations: Run `python3 scripts/check_site_assets.py` and inspect desktop/mobile wrapping for cover changes.

## Open questions
- [ ] Replace the temporary arXiv repository URL when the paper URL is public.
- [ ] Replace the temporary Online Viewer repository URL when the hosted viewer URL is public.
