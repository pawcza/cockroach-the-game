# Karaluch

A multiplayer browser game where you are a cockroach and everything is trying to kill you.

**[Play it](https://cockroach.wszystko.app)** in your browser or on your phone. The game is in Polish.

![Gameplay](docs/media/gameplay.gif)

[View the menu](docs/media/menu.png) · [View gameplay](docs/media/gameplay.png)

Run through levels, dodge obstacles, grab pickups and, if you survive long enough, fight bosses. Play alone or with friends in the same run: every player gets the same seed, so everyone sees the same level without the server sending it. Bosses appear in solo runs.

Built with TypeScript, Phaser 3, Node.js, Socket.IO and SQLite. The game is playable on desktop and mobile, with touch controls on phones.

## How it works

- **A shared course without streaming the level:** multiplayer clients use a shared seed to generate the same obstacles and pickups. Cosmetic randomness stays separate so effects cannot desynchronise the course.
- **Live multiplayer:** Socket.IO handles lobbies, player positions and game events. Players see locally simulated ghosts of one another; the server tracks who is alive and when a match ends.
- **A complete browser game:** the client brings together animated sprite atlases, audio, touch controls, level progression and solo boss encounters. Assets are loaded in packs without changing the rules of a run.
- **A server that can be tested:** the Express app is constructed separately from the listening process, allowing API and socket tests to exercise the real server.

The game UI is in Polish; the source and development documentation are in English.

## Controls

| Key | Action |
|---|---|
| `↑`, `↓` | Hop to the top lane, drop to the bottom lane |
| `→` | Dash |
| `Space` | Shoot (boss fight) |

## Run it

```bash
npm install
npm run dev    # http://localhost:5678
```

`npm run typecheck` checks the client and server, and `npm test` runs the test suite. The production build is `npm run build`.

## License

The code is MIT. The art, music and sound effects are not licensed for reuse. See [LICENSE](LICENSE).

## Sound credits

Most sound effects are synthesised by `tools/audio`, some layered with samples from CC0 packs (Kenney, OpenGameArt authors). What came from where, with links and licence evidence: [docs/SOUND_CREDITS.md](docs/SOUND_CREDITS.md).
