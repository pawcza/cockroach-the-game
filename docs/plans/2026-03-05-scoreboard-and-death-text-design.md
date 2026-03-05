# Scoreboard & Custom Death Text — Design

## Feature 1: Custom Death Text + Obstacle Image

Each obstacle type gets a unique death message and displays the obstacle sprite on the game over screen.

### Death Text Mapping

| Obstacle Type | Texture Key  | Death Text              |
|---------------|-------------|-------------------------|
| bird          | bird         | SRAK CIE OPTAKAL        |
| cat           | cat-paw      | Rozkotowany             |
| flipper       | flipper      | Kubota Ci w ryj!        |
| newspaper     | newspaper    | Naleszalo Ci siem       |
| onion         | onion        | Smrot Cie zmiotl        |
| spray         | pest-spray   | MUGA!                   |
| *(fallback)*  | *(none)*     | ZGNIOTLES SIE!          |

### Changes

- **ObstacleSpawner.ts**: Each spawn method adds `obstacle.setData('type', '<type>')`.
- **GameScene.ts**: `hitObstacle()` reads `obstacle.getData('type')`, passes it through `die()` to `GameOverScene` scene data.
- **GameOverScene.ts**: Maps obstacle type to death text and texture key. Displays the obstacle sprite (scale 0.3) above the death text.

---

## Feature 2: Global Scoreboard

### Architecture

Express.js server serves the static Vite build and a REST API. SQLite stores all scores. Deployed as a Docker container on Unraid with a persistent volume for the database.

### API

- `GET /api/scores?limit=100` — top 100 scores
- `GET /api/scores/:playerName` — player's best score + rank
- `POST /api/scores` — submit `{ name, score, deathCause, distance, timeSurvived }`

### Database

Single SQLite table:

```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  death_cause TEXT,
  distance INTEGER,
  time_survived INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_scores_score ON scores(score DESC);
```

### Game Flow

1. Player dies → GameOverScene checks if score beats local high score.
2. **New record**: text input appears ("Wpisz swoje imie:") with submit button. POST score to API. Fetch top 100 + player's rank. Show scoreboard with player highlighted.
3. **Not a new record**: "Tablica Wynikow" button shows the scoreboard on demand.
4. Scoreboard displays top 100 entries (rank, name, score) and the player's own rank if outside top 100.

### Server & Docker

- `server/index.ts`: Express app — serves `dist/` static files + `/api/scores` routes.
- `Dockerfile`: Node.js image, builds frontend, runs Express.
- SQLite file at `/data/scores.db` (Docker volume mount).
- Basic validation: score > 0, name 1-20 chars, rate limiting (1 submit per 5s per IP).
