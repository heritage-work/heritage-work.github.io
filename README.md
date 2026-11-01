# Heritage Games

Small web games made from Singapore heritage. One every other Thursday.

No build step, no framework, no dependencies. Plain ES modules.

## Run it

```sh
./serve.sh          # http://localhost:8080
```

`file://` will not work — ES modules and `fetch()` need a real origin.

## Layout

```
index.html          gallery, reads games/manifest.json
play.html           runner — play.html?g=<slug>
shell/
  tokens.css        colour + type tokens, light and dark
  shell.css         every shared component
  shell.js          loading, progress, result screen, share
mechanics/
  pick.js           one question at a time
  order.js          put items in order
  match.js          tap the pairs
  beats.js          three-lane rhythm, needs audio assets
  trace.js          draw a pattern in one unbroken line (rangoli)
games/
  manifest.json     what exists, and when it publishes
  <slug>/game.json  one game's content
```

## How multiple games load

Three indirections, all data-driven:

1. `index.html` fetches `games/manifest.json` and lists every entry whose
   `publish` date is today or earlier. Future-dated entries are your buffer —
   they sit in the repo, invisible, until their date arrives. No deploy needed
   to ship one.

2. `play.html?g=<slug>` fetches `games/<slug>/game.json`.

3. The shell reads that file's `mechanic` field and does
   `import('./mechanics/<mechanic>.js')` at runtime, then calls its `mount()`.

A **flagship** (a bigger game in its own project) gets a manifest entry with
an `href` and a `tag` instead of a game.json, and the gallery links straight to it.

So a mechanic is only ever downloaded by the people who play a game that uses
it. Adding a game is one folder and one manifest line. Adding a mechanic is one
file in `mechanics/`. Neither touches the shell.

## Assets and loading

A game.json may declare assets. The shell preloads them with a progress
screen before the mechanic mounts, so a mechanic never has to handle loading.

```json
"assets": {
  "drum":        { "audio": "audio/hit-drum" },
  "performance": { "audio": "audio/performance" },
  "poster":      { "image": "poster.jpg" }
}
```

Audio paths carry **no extension** — the shell serves `.ogg` (Opus) where the
browser supports it and `.m4a` otherwise, so ship both. Everything is relative
to `games/<slug>/`. Audio is decoded into an `AudioBuffer` and handed to the
mechanic as `api.assets.<key>`; play it with `api.play(buffer)`.

Any game with audio also gets a "Sound on" tap gate, because browsers will not
start audio without a user gesture.

Keep source WAVs outside the repo and commit only the compressed copies.
`../lion-media/` holds the originals; `ffmpeg -c:a libopus -b:a 64k` and
`-c:a aac -b:a 96k` is what produced the ones in `games/lion-dance-beats/`.

## Making a new game

```sh
mkdir games/my-slug
cp games/lion-dance-tells/game.json games/my-slug/game.json
# edit it, then add a line to games/manifest.json with a future publish date
```

Every `game.json` takes `title`, `kicker`, `blurb`, `mechanic`, `fact`,
`credit`, and a `content` block whose shape is the mechanic's business.
See `mechanics/README.md` for the contract.

## Rules that keep the cadence

- **Never clear rights.** Facts aren't copyrightable. Use them with original
  art. A game that needs a specific archival image or recording is a flagship,
  not a fortnightly — it goes in its own project.
- **Rotate mechanics, don't invent them.** Four or five, cycling. The content
  is the novelty.
- **Keep a buffer.** Eight games future-dated in the manifest before you
  announce week one.
- **Credit properly.** Every game.json has a `credit` field and the shell
  always renders it.
- **No end-screen lecture.** One `fact`, that's the budget. If the heritage
  isn't in the mechanic, it isn't in the game.

## Still to do

- Drafts dated `2099-01-01` are waiting for a review: `rangoli`, `lo-hei`,
  `kueh-tutu`, `wayang-kulit`, `sepak-takraw`, `hawker-centre`. Each is drawn
  from its Roots ICH entry (linked in its credit). Check the facts, then give
  each a real publish date. Until then, play one at `play.html?g=<slug>`.
- `games/kampong-order/` is placeholder content, so it's parked at
  `2099-01-01` too. Needs real dates and a curator pass before it gets a date.
- Open graph images per game for sharing.
- `games/lion-dance-beats/` is retired: Awaken the Lion (the flagship) has the
  real NMS transcription. The folder is still here, out of the manifest.
