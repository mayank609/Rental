# RentNest ad kit

Everything here is generated from code. It uses real app screens and an original, royalty-free music bed, so you can safely edit it and re-render.

## Deliverables (`out/`)

| File | Length | Size | Use it for |
|---|---|---|---|
| `rentnest-vertical-9x16-30s.mp4` | 30s · 1080×1920 | 5.4 MB | Instagram Reels & Stories, YouTube Shorts, Facebook Reels, Moj / Josh |
| `rentnest-vertical-9x16-15s.mp4` | 15s · 1080×1920 | 3.1 MB | Stories, Shorts, skippable short-form |
| `rentnest-square-1x1-30s.mp4` | 30s · 1080×1080 | 4.2 MB | Instagram / Facebook feed, LinkedIn |
| `rentnest-landscape-16x9-30s.mp4` | 30s · 1920×1080 | 5.1 MB | YouTube in-stream, website hero, connected TV |
| `*-thumbnail.jpg` | — | — | Cover / thumbnail (hook frame) |
| `*.srt` | — | — | Caption files (upload alongside the video on YouTube / Meta) |
| `rentnest-interactive.html` | ~1 min, branching | 0.48 MB | Interactive landing page or playable ad (single file, no external requests) |

All videos are H.264 High, 30 fps, AAC 160 kbps, `+faststart`. Every message is also on screen as text, because most feed ads autoplay muted.

### Storyboard (30s)
| Time | Scene | On-screen copy |
|---|---|---|
| 0–3.2s | Hook | "That ₹60,000 camera you used **twice** this year?" |
| 3.2–7s | Owners | "Rent it out." Counter to **₹17,777/month** (Sony A7 III, ₹1,800/day, 12 days, after fees) and the real earnings screen |
| 7–12s | Renters | "Need something? It's probably next door." Real home feed, "Andheri, Mumbai · 0.4 km away" |
| 12–16.5s | Range | "Why buy it? Rent it." 8 categories with from-prices |
| 16.5–21.5s | Trust | Verified users · deposit held till return · photo-checked handover, and the real booking-confirmed screen |
| 21.5–25.5s | How it works | Find it nearby → Book & pay securely → Pick up, use, return |
| 25.5–30s | End card | "RentNest. Rent anything. Earn from everything." CTA **Start on rentnest.in** |

The 15s cut is Hook → Owners → Renters → Trust → End card.

## Interactive film

The interactive film is live as a private page at https://claude.ai/artifact/SHsjt34u9qWGzn94DdDGWr. Share it from the page's Share menu.

- **Flow:** Hook → *What brings you here?*
  - **Rent path:** choose a city → choose a category → animated price breakdown (rent, 5% fee, GST, refundable deposit) → trust points → CTA to `/rent/{category}/{city}`.
  - **Earn path:** choose an idle item → days-per-month slider with a live earnings estimate and an Owner Pro toggle → trust points for owners → CTA to `/dashboard/listings/new`.
- **Engagement:** story-style chapter bar, tap to skip or go back, pause, sound toggle (looping music bed), "Try the other path", copy link, and replay. Keyboard: Space pauses, ← / → move between chapters.
- **Deep links:** add `#rent` or `#earn` to the URL to start on that path, so each ad set can target one audience.
- **Analytics:** each step pushes an event to `dataLayer` (GTM), and to `gtag` and `fbq` when they are present: `rn_chapter`, `rn_choose_path`, `rn_pick_city`, `rn_pick_category`, `rn_pick_item`, `rn_set_days`, `rn_toggle_pro`, `rn_switch_path`, `rn_share`, `rn_replay`, `rn_sound`, `rn_cta_click`. Event parameters include the path, city and item.
- **Playable ads:** the CTA calls `FbPlayableAd.onCTAClick()` (Meta playables), `mraid.open()` (MRAID networks) or `ExitApi.exit()` (Google Ads HTML5) when the container provides it. Otherwise it opens a normal link. It is one file with no external requests and weighs 0.48 MB, under Meta's 2 MB playable limit.
- **Before launch:** set `SITE_URL` and the UTM string at the top of `interactive/template.html`, then rebuild. Prices are clearly labelled as examples.

## Suggested ad copy

**Meta (Instagram / Facebook)**
- Primary text A (owners): *That camera, drone or PS5 gathering dust could pay for itself. List it free on RentNest and earn every time someone nearby rents it. Deposits and payments are handled for you.*
- Primary text B (renters): *Why buy a projector for one match night? Rent cameras, tents, bikes, consoles and more from verified people near you. Pay by UPI, and get your deposit back after return.*
- Headlines: "Rent anything near you" · "Earn from things you own" · "Why buy it? Rent it."
- CTA button: *Learn more* (landing page) / *Sign up* (owners)

**YouTube**
- Title: *RentNest: Rent anything. Earn from everything.*
- Companion headline: "Rent near you. Earn from your stuff."

**Google Performance Max / App**
- Headlines (≤30 chars): "Rent Anything Near You", "Earn From Your Idle Stuff", "Cameras, Bikes, Tents & More", "Verified Owners. Safe Deposits", "List Your Items Free"
- Descriptions (≤90 chars): "Rent cameras, gaming, camping gear and more from verified people in your city.", "List what you own for free and earn when neighbours rent it. Payments are protected."

Suggested split: run the **owner** creative (hook plus the earnings scene) and the **renter** creative (the 15s cut) as separate ad sets, and send each to the matching `#earn` or `#rent` interactive deep link.

## Regenerating

Requirements: the API on :4000 and `vite preview` on :4173 with seeded data (only needed to recapture screens), `ffmpeg`, `python3` with `numpy`, and the Playwright Chromium already used by the E2E tests.

```bash
cd client
node ../marketing/scripts/capture.mjs            # re-capture real app screens → marketing/assets
node ../marketing/scripts/render.mjs             # render all video formats (≈3 min)
node ../marketing/scripts/render.mjs square-1x1-30s   # or a single format
node ../marketing/scripts/build-interactive.mjs  # rebuild the interactive single-file HTML
node ../marketing/scripts/check-interactive.mjs  # click through both paths (smoke test)
```

- `promo/composition.html`: the video scenes. Every frame is a pure function of `window.seek(t)`. Preview in a browser at `composition.html?w=1080&h=1920&cut=30`, then call `seek(12)` in the console.
- `promo/shared.css` / `shared.js`: the brand system and helpers, shared by the video and the interactive film.
- `scripts/music.py`: the procedural music bed (96 BPM, Cmaj7–Am7–Fmaj7–G6), with a drop on the first reveal, whooshes on cuts and a chime on the end card.

Changing copy or prices: edit the scene text in `composition.html` (and `CAPTIONS` in `render.mjs` for the .srt files), then re-render.
