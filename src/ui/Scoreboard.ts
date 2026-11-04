export interface ScoreEntry {
  /** The account that saved it; null on runs saved before accounts. */
  user_id?: number | null;
  name: string;
  score: number;
  death_cause: string | null;
  distance: number | null;
  time_survived: number | null;
  apples_collected: number | null;
  tyskies_collected: number | null;
  pills_collected: number | null;
  max_level: number | null;
  max_combo: number | null;
}

/** Today's Karaluch Dnia, from the server: everyone's day and seed agree, whatever their clocks say. */
export interface DailyRun {
  date: string;
  seed: number;
}

export async function fetchDaily(): Promise<DailyRun | null> {
  try {
    const res = await fetch('/api/daily');
    return res.ok ? await res.json() as DailyRun : null;
  } catch {
    return null;
  }
}

/** The all-time board, or one day's Karaluch Dnia board. */
export async function fetchScores(daily?: string): Promise<ScoreEntry[]> {
  return fetchScoreboard(daily);
}

async function fetchScoreboard(daily?: string): Promise<ScoreEntry[]> {
  try {
    const res = await fetch(`/api/scores?limit=100${daily ? `&daily=${daily}` : ''}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * One line on where you stand in today's Karaluch Dnia: your saved place, or where your best run here would land, or
 * who leads when you haven't played. The board holds each player's best, at most 100 of them.
 */
export function dailyStanding(board: ScoreEntry[], me: { id: number } | null, localBest: number): string {
  const total = board.length >= 100 ? '100+' : String(board.length);
  const mine = me ? board.findIndex(entry => entry.user_id === me.id) : -1;
  if (mine >= 0) return `Ty: ${board[mine].score} · ${mine + 1}. miejsce z ${total}`;
  if (localBest > 0) {
    const place = board.filter(entry => entry.score > localBest).length + 1;
    return `Ty: ${localBest} · byłoby ${place}. z ${board.length + 1}`;
  }
  if (board.length > 0) return `Prowadzi ${board[0].name}: ${board[0].score}`;
  return 'Nikt jeszcze nie grał';
}
