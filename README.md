# Token Game

A static two-page site for a stream token game:

- **`controller.html`**: run by one person to manage tokens, drain rate, prize, and play/pause.
- **`view.html`**: an OBS Browser Source. It shows a coin with the token count on a transparent background, with the drain rate and current prize underneath.

Tokens drain while the game is playing (5 per minute by default). The prize starts at 1000 and drops 100 for every 10 minutes of *play time*, so pausing freezes it too. When tokens reach 0 the game pauses itself. The prize never goes below 0.

State lives in Firebase Realtime Database (the free Spark plan is enough). The controller and the view can run on different machines.

## How it works: anchored state

The database never gets a write per tick. It holds an *anchor*: the token count and accumulated play time at one moment (`anchorAt`, server-synced), plus whether the game is running. Each client computes the live tokens and prize from that anchor on its own (`js/state.js`, `computeLive`). Every user action "re-anchors": it freezes the live values at the current moment and writes them back with a new `anchorAt`. The result is a handful of writes per session. The view stays correct even if the controller tab is closed, and clients can't drift apart because they all use Firebase's server time offset.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Landing page with links to the controller and view (keeps `?room=`) |
| `controller.html`, `css/controller.css`, `js/controller.js` | Controller UI |
| `view.html`, `css/view.css`, `js/view.js` | OBS overlay |
| `js/state.js` | Pure game logic (no Firebase), unit tested |
| `js/db.js` | Thin Firebase I/O wrapper |
| `js/firebase-config.js` | Your Firebase web config plus the default room name |
| `database.rules.json` | Realtime Database security rules |
| `tests/state.test.mjs` | Tests for `state.js` |

## One-time setup

1. **Create the database.** In the [Firebase console](https://console.firebase.google.com/), create a project, then go to *Build → Realtime Database → Create database* and start in **locked mode**. Open the **Rules** tab, paste in the contents of `database.rules.json`, and click *Publish*.
2. **Register a web app.** Go to *Project settings → General → Your apps → Add app → Web*. Copy the `firebaseConfig` values into `js/firebase-config.js`, replacing the placeholders. Check that `databaseURL` matches the URL shown on the Realtime Database page. These values identify your project and are safe to commit; the rules control access.
3. **Publish with GitHub Pages.** Push the repo to GitHub. Under *Settings → Pages*, choose *Deploy from a branch*, pick your branch, and set the folder to `/ (root)`.
4. **Set up OBS.** Add a *Browser* source with this URL:

   ```
   https://<user>.github.io/<repo>/view.html?room=<secret-room-id>
   ```

   A size of about **400 x 450** works well. The page is already transparent, so leave OBS's custom CSS field empty (or clear the default). To resize the overlay, add `&scale=1.5` (or any factor) to the URL. Open the controller at `https://<user>.github.io/<repo>/controller.html?room=<secret-room-id>`. The controller's **OBS URL** box shows the exact view URL for its room, with a Copy button.

Choose a long, random room ID (for example, the output of `openssl rand -hex 12`). See [Security](#security) for why.

## Local testing

ES modules don't load from `file://`, so serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Then open these two pages side by side:

- <http://localhost:8000/controller.html?room=test>
- <http://localhost:8000/view.html?room=test>

The pages still talk to your real Firebase database, so fill in `js/firebase-config.js` first.

## Running tests

The game logic in `js/state.js` has no dependencies and runs under Node's built-in test runner (Node 20+):

```sh
node --test
```

This finds `tests/state.test.mjs` automatically. You can also pass the file explicitly: `node --test tests/state.test.mjs`.

## Security

There's no authentication. The rules deny reads and writes at the database root and at `/games`, so a client can't list rooms. Each `games/<roomId>` is open to anyone who knows its ID, so **the room ID is a shared secret**. The rules also check field types and ranges so a stray write can't corrupt the state shape.

**Future: add auth.** To lock this down properly, enable Firebase Authentication (for example, Google sign-in for the controller), record the owner's `uid` on each room, and change the rules so only the owner can write (`auth.uid === data.child('owner').val()`). Reads can stay public so the OBS view needs no login.
