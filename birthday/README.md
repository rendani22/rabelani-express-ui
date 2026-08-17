# Our Story in Starlight 🎂

A self-contained, interactive birthday page — a scrolling photo timeline of your
story together, ending with a candle she can blow out (tap it!) and a confetti
finale. No build step, no dependencies, works offline: just open
`index.html` in a browser.

> **Note:** this folder is a standalone gift page. It is not part of the
> Dispatch React app and is not imported by it.

## Make it hers

Everything personal lives in the **`EDIT ME` block** at the top of the
`<script>` section in `index.html`:

1. **Her name & your sign-off** — `name`, `signoff`, `birthday`.
2. **The day you met** — `firstMet` (`YYYY-MM-DD`). This powers the live
   "days of loving you" counter in the hero.
3. **The moments** — each entry in `moments` has a `date`, `title`, `text`,
   and `photo`. Add, remove, or reorder as many as you like; the timeline
   adapts automatically.

## Add your photos

Drop your pictures into the `photos/` folder using the filenames referenced in
the `moments` config (or change the filenames in the config to match your
files):

```
photos/first-met.jpg
photos/first-date.jpg
photos/i-love-you.jpg
photos/adventures.jpg
photos/the-yes.jpg
photos/today.jpg
```

Portrait photos (4:5-ish) look best in the polaroid frames, but any photo is
cropped to fit. Until a photo exists, the page paints a soft placeholder with a
hint of which file to add — so you can preview the design right away.

## Sharing it

Because the page is a single file (fonts embedded), you can:

- open it directly from disk (double-click `index.html`),
- host the `birthday/` folder on any static host (GitHub Pages, Netlify,
  Vercel, Cloudflare Pages), or
- send the folder to her phone/laptop as-is.

Little touches to know about: the hero sky twinkles with rising embers, each
polaroid opens in a lightbox when tapped, the timeline lights up as you scroll,
and the candle at the end blows out with a puff of smoke and confetti. All
motion respects `prefers-reduced-motion`.
