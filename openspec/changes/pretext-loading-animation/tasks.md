# Tasks: Pretext Loading Animation

## 1. Setup & Dependencies
- [ ] Install the `pretext` library inside `web-app` (`npm install @chenglou/pretext`).

## 2. Scaffold Component
- [ ] Create a new file: `web-app/components/DynamicTextLoader.tsx`.
- [ ] Implement the basic React component with a `<canvas>` and a ref.
- [ ] Add a `ResizeObserver` to keep the canvas' internal coordinate system matched with its display size.

## 3. Implement Animation Loop
- [ ] Set up a `requestAnimationFrame` loop in a `useEffect`.
- [ ] Add the logic for the "Scanning Orb", giving it an initial position, velocity, and bounds collision.
- [ ] Render the orb on the canvas.

## 4. Integrate Pretext
- [ ] Import `prepareWithSegments`, `layoutNextLineRange`, and `materializeLineRange`.
- [ ] Call `prepareWithSegments` with the loading text ("Scanning Repository...") and a specified canvas font. Do this only once or when the text prop changes.
- [ ] In the render loop, calculate the available line width based on the orb's intersection. 
- [ ] Use a `while(true)` loop to lay out lines and draw them with `ctx.fillText`.

## 5. Replace Old UI
- [ ] Open `web-app/app/books/new/page.tsx`.
- [ ] Find the existing submit button loading state (`loading ? ( <> <svg...> Scanning Repository... </> ) : (...)`).
- [ ] Replace it with the new `<DynamicTextLoader text="Scanning Repository..." />` component, ensuring it fits cleanly within the layout.

## 6. Polish
- [ ] Adjust the font styling, canvas colors, and orb glow to match the site's design system (Tailwind / dark mode).
- [ ] Test the text reflow to ensure it doesn't clip or overlap the orb unexpectedly.
