/**
 * The run's music: one track at full level, and on a change the old one fading out under the new one fading in. Every
 * track it starts stays its own until it is ended, however the fades go: a change in the middle of a crossfade (after a
 * boss, the level the fight was fought in and then the level that arrives as the reward, a frame apart) fades the
 * outgoing tracks on from where they are, and stop() ends all of them. A track no one holds would loop on for good,
 * since the sound manager outlives the scene.
 *
 * It can also hold everything where it is (the pause menu: only the crickets sound) and let it go on from the same spot.
 * The hold's fades run on a clock of their own, as the scene's tweens and timers stand still while paused.
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
  /** A fade on the scene's clock, `ms` long (the deck's default when not given). */
  fade(from: number, to: number, onUpdate: (level: number) => void, onDone: () => void, ms?: number): MusicFade;
  /** A fade that runs whatever the scene clock does, for the hold (the scene is paused then). */
  ramp(from: number, to: number, ms: number, onUpdate: (level: number) => void, onDone: () => void): MusicFade;
  /** Holds a track where it is / lets it go on from there. */
  pause(track: T): void;
  resume(track: T): void;
}

/** How long the hold and the release take to fade, ms. */
export const HOLD_FADE_MS = 220;

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
  /** The share of every track's level that is let through: 1, and 0 while held. */
  private master = 1;
  private masterFade: MusicFade | null = null;
  private held = false;

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

  get isHeld(): boolean { return this.held; }

  /** Crossfades to the track, over `ms` when given; the same one again does nothing. */
  switchTo(key: string, ms?: number): void {
    if (key === this._key) return;
    this._key = key;
    if (this.held) {
      // Nothing is heard while held: swap the tracks outright, the new one waiting where the old was
      this.endAll();
      const next: Playing<T> = { track: this.ports.play(key, 0), level: MUSIC_LEVEL, fade: null };
      this.playing = next;
      this.ports.pause(next.track);
      return;
    }
    const old = this.playing;
    if (old) {
      this.outgoing.push(old);
      this.fadeTo(old, 0, () => {
        this.outgoing = this.outgoing.filter(p => p !== old);
        this.ports.end(old.track);
      }, ms);
    }
    const next: Playing<T> = { track: this.ports.play(key, 0), level: 0, fade: null };
    this.playing = next;
    this.fadeTo(next, MUSIC_LEVEL, () => {}, ms);
  }

  /** Fades the music out over `ms` and ends it; nothing plays after (a boss's music under his victory stinger). */
  fadeOut(ms: number): void {
    const old = this.playing;
    this._key = '';
    this.playing = null;
    if (this.held) {
      this.endAll(old);
      return;
    }
    if (!old) return;
    this.outgoing.push(old);
    this.fadeTo(old, 0, () => {
      this.outgoing = this.outgoing.filter(p => p !== old);
      this.ports.end(old.track);
    }, ms);
  }

  /** Holds every track where it is, fading out first so there is no click. */
  hold(): void {
    if (this.held) return;
    this.held = true;
    this.fadeMaster(0, () => {
      for (const p of this.all()) this.ports.pause(p.track);
    });
  }

  /** Lets the held tracks go on from where they stopped, fading back in. */
  release(): void {
    if (!this.held) return;
    this.held = false;
    for (const p of this.all()) this.ports.resume(p.track);
    this.fadeMaster(1, () => {});
  }

  /** Ends every track it holds, at once. */
  stop(): void {
    this.masterFade?.stop();
    this.masterFade = null;
    this.master = 1;
    this.held = false;
    this.endAll();
    this._key = '';
  }

  private all(): Playing<T>[] {
    return [...this.outgoing, ...(this.playing ? [this.playing] : [])];
  }

  /** Ends every track (and `extra`, one already taken off the books). */
  private endAll(extra: Playing<T> | null = null): void {
    for (const p of [...this.all(), ...(extra ? [extra] : [])]) {
      p.fade?.stop();
      this.ports.end(p.track);
    }
    this.outgoing = [];
    this.playing = null;
  }

  private fadeMaster(to: number, onDone: () => void): void {
    this.masterFade?.stop();
    this.masterFade = this.ports.ramp(this.master, to, HOLD_FADE_MS, (m) => {
      this.master = m;
      for (const p of this.all()) this.ports.setLevel(p.track, p.level * m);
    }, () => {
      this.masterFade = null;
      onDone();
    });
  }

  /** From the level the track has reached: a track cut off mid fade-in fades out from there. */
  private fadeTo(p: Playing<T>, to: number, onDone: () => void, ms?: number): void {
    p.fade?.stop();
    p.fade = this.ports.fade(p.level, to, (level) => {
      p.level = level;
      this.ports.setLevel(p.track, level * this.master);
    }, () => {
      p.fade = null;
      onDone();
    }, ms);
  }
}
