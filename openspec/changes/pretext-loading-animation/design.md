# Design: Pretext Loading Animation

## Architecture Overview
The animation will be implemented in a new React component called `<DynamicTextLoader />`. It will utilize a `<canvas>` element and a `requestAnimationFrame` loop. 

## Key Technologies
- **React**: To encapsulate the canvas logic in a `useEffect` hook.
- **Canvas API**: `ctx.fillText` for high-performance rendering.
- **@chenglou/pretext**: 
  - `prepareWithSegments`: To perform the one-time expensive text preparation and measurement.
  - `layoutNextLineRange`: To route the text row by row around the dynamic obstacle.
  - `materializeLineRange`: To convert the line layout back into renderable text strings.

## Implementation Details

1. **The Canvas State**: 
   - A single HTML5 canvas with a width/height calculated via a `ResizeObserver` on the parent container.
   - An internal physics state for the "Scanning Orb" (e.g. `x`, `y`, `vx`, `vy`, `radius`).

2. **The Render Loop**:
   - In `requestAnimationFrame`:
     - Update the orb's physics (bounce off canvas edges).
     - Clear the canvas.
     - Draw the orb (a styled glowing circle).
     - Reset the `LayoutCursor`.
     - Layout text line by line using `pretext`. If the current `y` intersects the orb's bounding box, adjust the `width` and `x` offset of that text line so it flows around the orb.
     - Draw the text using `ctx.fillText(line.text, x, y)`.

3. **Integration**:
   - In `web-app/app/books/new/page.tsx`, replace the `<svg>` spinner and the static "Scanning Repository..." text with `<DynamicTextLoader text="Scanning Repository..." />`.
