# Proposal: Pretext-Powered Loading Animation

## Goal
The current loading state for "Scanning Repository..." after clicking "Create" is a static text with a standard spinning SVG. The goal is to integrate the `@chenglou/pretext` library to build a highly interactive, 60fps dynamic typographic loading animation that replaces this boring state.

## Motivation
`@chenglou/pretext` provides a unique capability: measuring and laying out multiline text purely in JavaScript, completely side-stepping the browser's DOM measurement and reflow overhead. This allows for rich, fluid, physics-driven typographic animations that would otherwise be janky or impossible with CSS and standard DOM elements. By using it, we can create an engaging "wow" moment when a user creates a new book.

## Concept: Dynamic Layout Flow
Inspired by the "dynamic layout" demos from the `pretext` repository, the loading animation will feature:
1. **A Scanning "Orb"**: An animated graphical shape or circle bouncing around within a canvas container.
2. **Fluid Text Wrapping**: The "Scanning Repository...", "Parsing AST...", and "Reading files..." text strings will be drawn around the bouncing orb.
3. As the orb moves, the text will instantly reflow and wrap its lines around the new position of the orb at 60fps, showcasing the capabilities of the library while providing a hypnotic loading state.
