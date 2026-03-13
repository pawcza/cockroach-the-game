interface ScoreEntry {
  name: string;
  score: number;
  death_cause: string | null;
}

export async function fetchScores(): Promise<ScoreEntry[]> {
  return fetchScoreboard();
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
