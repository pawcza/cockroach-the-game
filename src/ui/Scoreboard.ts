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

/** The all-time board, one day's Karaluch Dnia board, or the endless one (Bez końca). An empty board when it can't be reached. */
export async function fetchScores(daily?: string, board?: 'endless'): Promise<ScoreEntry[]> {
  return (await fetchScoreboard(daily, board)) ?? [];
}

/** The same, but null when the server couldn't be reached or answered badly, so a page can say so instead of "empty". */
export async function fetchScoresChecked(daily?: string, board?: 'endless'): Promise<ScoreEntry[] | null> {
  return fetchScoreboard(daily, board);
}

async function fetchScoreboard(daily?: string, board?: 'endless'): Promise<ScoreEntry[] | null> {
  try {
    const res = await fetch(`/api/scores?limit=100${daily ? `&daily=${daily}` : board ? `&board=${board}` : ''}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The leader's name as far as the button's second line has room for: it is a few characters of a long one. */
const LEADER_NAME_MAX = 10;

/**
 * One line on where you stand in today's Karaluch Dnia, short enough for the mode button's second line: your saved
 * place, or where your best run here would land, or who leads when you haven't played. The board holds each player's
 * best, at most 100 of them.
 */
export function dailyStanding(board: ScoreEntry[], me: { id: number } | null, localBest: number): string {
  const total = board.length >= 100 ? '100+' : String(board.length);
  const mine = me ? board.findIndex(entry => entry.user_id === me.id) : -1;
  if (mine >= 0) return `Ty: ${board[mine].score} · ${mine + 1}. z ${total}`;
  if (localBest > 0) {
    const place = board.filter(entry => entry.score > localBest).length + 1;
    return `Ty: ${localBest} · byłoby ${place}.`;
  }
  if (board.length > 0) {
    const { name, score } = board[0];
    return `1. ${name.length > LEADER_NAME_MAX ? `${name.slice(0, LEADER_NAME_MAX - 1)}…` : name}: ${score}`;
  }
  return 'Nikt jeszcze nie grał';
}
