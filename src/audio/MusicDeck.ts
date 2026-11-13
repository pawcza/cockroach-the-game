/**
 * The run's music: one track at full level, and on a change the old one fading out under the new one fading in. Every
 * track it starts stays its own until it is ended, however the fades go: a change in the middle of a crossfade (after a
 * boss, the level the fight was fought in and then the level that arrives as the reward, a frame apart) fades the
 * outgoing tracks on from where they are, and stop() ends all of them. A track no one holds would loop on for good,
 * since the sound manager outlives the scene.
 */

/** A track's level at full: the music setting scales it (AudioManager). */
export const MUSIC_LEVEL = 0.5;

export interface MusicFade {
  /** Ends the fade where it is, without its onDone (as a Phaser tween's stop does). */
  stop(): void;
}

/** What the deck needs of the sound system, so it runs without Phaser. */
export interface MusicPorts<T> {
  /** Starts a looping track at a level. */
  play(key: string, level: number): T;
  setLevel(track: T, level: number): void;
  /** Stops a track and frees it. */
  end(track: T): void;
  fade(from: number, to: number, onUpdate: (level: number) => void, onDone: () => void): MusicFade;
}

interface Playing<T> {
  track: T;
  level: number;
  fade: MusicFade | null;
}

export class MusicDeck<T> {
  private ports: MusicPorts<T>;
  private playing: Playing<T> | null = null;
  private outgoing: Playing<T>[] = [];
  private _key = '';

  constructor(ports: MusicPorts<T>) {
    this.ports = ports;
  }

  /** The track playing or fading in; '' when none. */
  get key(): string { return this._key; }

  get current(): T | null { return this.playing?.track ?? null; }

  /** Straight in at full level, everything else ended. */
  start(key: string): void {
    this.stop();
    this._key = key;
    this.playing = { track: this.ports.play(key, MUSIC_LEVEL), level: MUSIC_LEVEL, fade: null };
  }

  /** Crossfades to the track; the same one again does nothing. */
  switchTo(key: string): void {
    if (key === this._key) return;
    this._key = key;
    const old = this.playing;
    if (old) {
      this.outgoing.push(old);
      this.fadeTo(old, 0, () => {
        this.outgoing = this.outgoing.filter(p => p !== old);
        this.ports.end(old.track);
      });
    }
    const next: Playing<T> = { track: this.ports.play(key, 0), level: 0, fade: null };
    this.playing = next;
    this.fadeTo(next, MUSIC_LEVEL, () => {});
  }

  /** Ends every track it holds, at once. */
  stop(): void {
    for (const p of [...this.outgoing, ...(this.playing ? [this.playing] : [])]) {
      p.fade?.stop();
      this.ports.end(p.track);
    }
    this.outgoing = [];
    this.playing = null;
    this._key = '';
  }

  /** From the level the track has reached: a track cut off mid fade-in fades out from there. */
  private fadeTo(p: Playing<T>, to: number, onDone: () => void): void {
    p.fade?.stop();
    p.fade = this.ports.fade(p.level, to, (level) => {
      p.level = level;
      this.ports.setLevel(p.track, level);
    }, () => {
      p.fade = null;
      onDone();
    });
  }
}
