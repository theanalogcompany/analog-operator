# Kickoff prompt for Claude Code

Run this from the root of the `analog-operator` checkout, with
`design_handoff_operator_redesign/` copied into it.

---

Read `design_handoff_operator_redesign/README.md` in full before writing any
code. It documents a redesign of this app's entire operator surface, with exact
colors, type, spacing and motion values.

Context you should confirm for yourself first:
- This is an Expo / React Native app using expo-router (`app/`), NativeWind, and
  a palette defined in `tailwind.config.js`.
- The HTML files in the handoff folder are **design references**, not code to
  port. Recreate the designs in React Native using this codebase's existing
  patterns, components and libraries.

Then plan before you build. Specifically:
1. List which existing routes and components the redesign replaces, keeps, or
   retires. (The hamburger menu is retired; sign-out moves into a new "You"
   tab. `components/queue/queue-card.tsx` is substantially rewritten.)
2. Name the new shared pieces you'd add — I'd expect at least a ground/gradient
   component, a top-nav component, a message-bubble component, and a
   tracked-caps text style — and where they'd live.
3. Tell me what the README leaves ambiguous before you guess at it.

Two constraints:
- **The gradient background colors are placeholders.** Put all five ground
  definitions in one module so they can be swapped without touching a screen.
- Keep `lib/fixtures/queue.ts` and `lib/fixtures/conversations.ts` as the data
  source. Don't inline the prototype's copy.

Start with the queue card and its swipe mechanics — it's the hardest part and
everything else is calmer. Get one card swiping with the wash overlays and the
peek stack before touching any other screen. Don't build all nine screens in one
pass.
