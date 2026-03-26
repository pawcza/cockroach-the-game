const KEYS = {
  PLAYER_NAME: 'cockroach-mp-name',
  HIGH_SCORE: 'cockroach-highscore',
  GAMES_PLAYED: 'cockroach-games-played',
  MUSIC_VOLUME: 'cockroach-music-vol',
  SFX_VOLUME: 'cockroach-sfx-vol',
} as const;

const DEFAULT_NAME = 'Karaluch';

export function getPlayerName(): string {
  return localStorage.getItem(KEYS.PLAYER_NAME) || '';
}

export function getPlayerNameOrDefault(): string {
  return getPlayerName() || DEFAULT_NAME;
}

export function isPlayerNameCustom(): boolean {
  return getPlayerName().length > 0;
}

export function setPlayerName(name: string): void {
  localStorage.setItem(KEYS.PLAYER_NAME, name.trim().slice(0, 20));
}

export function getHighScore(): number {
  return parseInt(localStorage.getItem(KEYS.HIGH_SCORE) || '0', 10);
}

export function setHighScore(score: number): void {
  localStorage.setItem(KEYS.HIGH_SCORE, score.toString());
}

export function updateHighScoreIfBetter(score: number): boolean {
  if (score > getHighScore()) {
    setHighScore(score);
    return true;
  }
  return false;
}

export function getGamesPlayed(): number {
  return parseInt(localStorage.getItem(KEYS.GAMES_PLAYED) || '0', 10);
}

export function incrementGamesPlayed(): void {
  localStorage.setItem(KEYS.GAMES_PLAYED, (getGamesPlayed() + 1).toString());
}

export function getMusicVolume(): number {
  return parseFloat(localStorage.getItem(KEYS.MUSIC_VOLUME) ?? '1');
}

export function setMusicVolume(vol: number): void {
  localStorage.setItem(KEYS.MUSIC_VOLUME, vol.toString());
}

export function getSfxVolume(): number {
  return parseFloat(localStorage.getItem(KEYS.SFX_VOLUME) ?? '1');
}

export function setSfxVolume(vol: number): void {
  localStorage.setItem(KEYS.SFX_VOLUME, vol.toString());
}
