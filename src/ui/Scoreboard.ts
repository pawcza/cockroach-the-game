import Phaser from 'phaser';

interface ScoreEntry {
  name: string;
  score: number;
  death_cause: string | null;
}

async function fetchScoreboard(): Promise<ScoreEntry[]> {
  try {
    const res = await fetch('/api/scores?limit=100');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function fetchPlayerRank(name: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/scores/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.rank;
  } catch {
    return null;
  }
}

// All scoreboard elements go into this container so they can be destroyed together
let scoreboardContainer: Phaser.GameObjects.Container | null = null;

export function isScoreboardOpen(): boolean {
  return scoreboardContainer !== null && scoreboardContainer.active;
}

export function closeScoreboard(): void {
  if (scoreboardContainer) {
    scoreboardContainer.destroy();
    scoreboardContainer = null;
  }
}

export function toggleScoreboard(scene: Phaser.Scene, highlightName: string | null): void {
  if (isScoreboardOpen()) {
    closeScoreboard();
  } else {
    showScoreboard(scene, highlightName);
  }
}

export async function showScoreboard(
  scene: Phaser.Scene,
  highlightName: string | null,
): Promise<void> {
  // Close any existing scoreboard first
  closeScoreboard();

  const { width, height } = scene.cameras.main;
  const scores = await fetchScoreboard();

  scoreboardContainer = scene.add.container(0, 0).setDepth(3000);

  // Semi-transparent overlay
  const overlay = scene.add.rectangle(width / 2, height / 2, width - 40, height - 40, 0x000000, 0.85);
  scoreboardContainer.add(overlay);

  const title = scene.add.text(width / 2, 30, 'TABLICA WYNIKÓW', {
    fontSize: '11px',
    color: '#ffff00',
    fontFamily: '"Press Start 2P", monospace',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5);
  scoreboardContainer.add(title);

  if (scores.length === 0) {
    const emptyText = scene.add.text(width / 2, height / 2, 'Jeszcze pusto... Bądź pierwszy!', {
      fontSize: '10px',
      color: '#888888',
      fontFamily: '"Press Start 2P", monospace',
    }).setOrigin(0.5);
    scoreboardContainer.add(emptyText);
    return;
  }

  const startY = 55;
  const lineHeight = 16;
  const maxVisible = Math.min(scores.length, Math.floor((height - 90) / lineHeight));

  for (let i = 0; i < maxVisible; i++) {
    const entry = scores[i];
    const rank = i + 1;
    const isHighlighted = highlightName && entry.name === highlightName;
    const color = isHighlighted ? '#00ff00' : rank <= 3 ? '#ffdd00' : '#cccccc';

    const line = `${String(rank).padStart(3, ' ')}. ${entry.name.padEnd(20, ' ')} ${String(entry.score).padStart(6, ' ')}`;
    const lineText = scene.add.text(width / 2, startY + i * lineHeight, line, {
      fontSize: '8px',
      color,
      fontFamily: '"Press Start 2P", monospace',
    }).setOrigin(0.5, 0);
    scoreboardContainer.add(lineText);
  }

  if (highlightName) {
    const rank = await fetchPlayerRank(highlightName);
    if (rank && rank > maxVisible) {
      const rankText = scene.add.text(width / 2, height - 35, `Twoja pozycja: #${rank}`, {
        fontSize: '9px',
        color: '#00ff00',
        fontFamily: '"Press Start 2P", monospace',
      }).setOrigin(0.5);
      scoreboardContainer.add(rankText);
    }
  }
}
