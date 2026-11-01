# Mechanic contract

A mechanic is one ES module in this folder. The filename stem is its id,
and that id is what a game.json puts in its `mechanic` field.

```js
export const meta = { id: 'pick', name: 'Pick one' };

export async function mount({ root, content, game, api }) { ... }
```

- `root`    — the stage element. Render into it however you like.
- `content` — whatever that mechanic's schema says, straight from game.json.
- `game`    — the whole game.json (title, fact, credit...).
- `api`     — `{ el, shuffle, setProgress(done,total), finish({score,total,line}) }`

The only hard rule: call `api.finish()` exactly once. The shell owns the
result screen, the share button and the credit line, so a mechanic never
renders those itself.

Adding a mechanic is one new file here. Nothing else in the shell changes.
