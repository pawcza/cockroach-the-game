/**
 * What the fight looks like: the pistol's descent, Zlewiatan (one sprite playing its baked animations: rising out of
 * the drain, the head that fires rearing back and spitting, flinching, the red-hot rage, the charge, draining away),
 * explosions and popups. Holds no fight state.
 */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { Player } from '../../objects/Player';
import { popupStyle } from '../../utils/TextStyles';
import { OBSTACLE_OFFSET } from './bossConfig';
import {
  createZlewiatanAnimations, frontAt, frontBetween, Head, ZLEWIATAN_TEXTURE, zlewiatanAnimKey, zlewiatanFrame,
} from './zlewiatanConfig';
import { ZLEWIATAN_ANIMS, ZLEWIATAN_RELEASE, ZlewiatanAnim } from './zlewiatanFrames';

/** How long the roach takes to rear up before the pistol starts coming down: the rear animation, and a beat. */
const REAR_MS = 500;
/** Where the boss stands, in from the screen's right edge (its pivot, world px). */
const STAND_FROM_RIGHT = 95;
/** Its front never comes closer to the roach than this, world px: where it stands on a narrow screen, and the charge. */
export const FRONT_GAP = 140;
/** The rows its front is measured on for keeping clear of the roach: this far above and below its pivot, world px. */
const REACH_ROWS = 100;
/** A spit plays faster when shots come quicker than it lasts, up to this much. */
const SPIT_MAX_SPEEDUP = 1.4;

type Loop = 'idle' | 'rage' | 'charge';
type Spit = 'spit-block' | 'spit-pierog' | 'spit-carp' | 'rage-spit';

export class BossVisuals {
  private scene: Phaser.Scene;
  private player: Player;
  private audio: AudioManager;
  private bossY: number;

  private boss: Phaser.GameObjects.Sprite | null = null;
  /** What it goes back to between spits and flinches. */
  private loop: Loop = 'idle';
  /** A spit's shot that hasn't left yet: it goes on the release frame, or at once if something cuts the spit short. */
  private release: (() => void) | null = null;
  private beastAmbientSound: Phaser.Sound.BaseSound | null = null;
  private godray!: Phaser.GameObjects.Graphics;
  /** The pistol coming down from the sky, until the roach catches it: from then on it's in the roach's own frames. */
  private pistol: Phaser.GameObjects.Image | null = null;
  /** Where the godray shines from, on screen: the pistol, and where it was caught once it's gone. */
  private rayAt: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, player: Player, audio: AudioManager, floorTopY: number, floorBottomY: number) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.bossY = (floorTopY + floorBottomY) / 2 - OBSTACLE_OFFSET;
    createZlewiatanAnimations(scene);
  }

  get bossAlive(): boolean { return this.boss?.active ?? false; }
  /** The boss's point: its frames' pivot, which the charge moves. */
  get bossX(): number { return this.boss?.x ?? 0; }
  set bossX(x: number) { if (this.boss) this.boss.x = x; }

  /** Where its front is drawn on the row at world y, world px; null where nothing of it is on that row. */
  frontX(y: number, charging: boolean): number | null {
    if (!this.boss) return null;
    const front = frontAt((y - this.boss.y) / SPRITE_SCALE, charging);
    return front === null ? null : this.boss.x + front * SPRITE_SCALE;
  }

  /** The furthest its front reaches between the lanes, world px from its pivot (negative): what must keep clear of the roach. */
  reach(charging: boolean): number {
    return frontBetween(-REACH_ROWS / SPRITE_SCALE, REACH_ROWS / SPRITE_SCALE, charging) * SPRITE_SCALE;
  }

  /** Where a head's mouth is on its spit's release frame, world px. */
  mouth(spit: Spit): { x: number; y: number } {
    const r = ZLEWIATAN_RELEASE[spit];
    return { x: this.bossX + r.x * SPRITE_SCALE, y: (this.boss?.y ?? this.bossY) + r.y * SPRITE_SCALE };
  }

  /**
   * The stopped cockroach rears up and catches the pistol coming down (the gift: `onGift` fires as it lands); the boss
   * then rises out of its drain. A roach that already owns the gun skips the godray and just draws it as it rears.
   */
  playIntro(onArrived: () => void, owned: boolean, onGift: () => void): void {
    this.player.enterBossStance();
    this.scene.time.delayedCall(REAR_MS, () => {
      if (owned) {
        this.player.catchPistol();
        this.enterBoss(onArrived);
      } else {
        this.descendPistol(onArrived, onGift);
      }
    });
  }

  private descendPistol(onArrived: () => void, onGift: () => void): void {
    const sprite = this.player.sprite;
    const cam = this.scene.cameras.main;
    const target = this.player.catchPoint;

    this.godray = this.scene.add.graphics();
    this.godray.setScrollFactor(0);
    this.godray.setDepth(DEPTH.GODRAY);
    this.godray.setAlpha(0);

    // The same pixels the roach then holds, at the same scale: it lands exactly on the grip of the catch's first frame
    const pistol = this.scene.add.image(target.x, cam.scrollY - 50, ATLAS, frameOf('pistol'));
    pistol.setScale(SPRITE_SCALE).setDepth(sprite.depth + 1);
    this.pistol = pistol;

    this.audio.playSfx('boss-choir', 0.7);

    this.scene.tweens.add({ targets: this.godray, alpha: 0.6, duration: 500 });

    this.scene.tweens.add({
      targets: pistol,
      y: target.y,
      duration: 1500,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Gone the moment the roach holds its own
        this.destroyPistol();
        this.player.catchPistol();
        onGift();
        this.audio.playSfx('dash-ready', VOL.pickup);
        sprite.setTint(0xffffff);
        this.scene.time.delayedCall(150, () => sprite.clearTint());

        this.scene.tweens.add({
          targets: this.godray,
          alpha: 0,
          duration: 500,
          onComplete: () => this.godray.destroy(),
        });

        this.enterBoss(onArrived);
      },
    });
  }

  /** The drain gurgles and the three heads surge up out of it, one by one, and roar. */
  private enterBoss(onArrived: () => void): void {
    const cam = this.scene.cameras.main;
    // Its spot near the right edge; on a narrow screen far enough right that its front keeps clear of the roach
    const clear = this.player.sprite.x - cam.scrollX + FRONT_GAP - this.reach(false);
    const x = cam.scrollX + Math.max(cam.width - STAND_FROM_RIGHT, clear);
    this.boss = this.scene.add.sprite(x, this.bossY, ZLEWIATAN_TEXTURE, zlewiatanFrame('emerge'));
    this.boss.setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
    this.boss.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onFrame, this);

    this.audio.playSfx('zl-gurgle', VOL.boss);
    this.beastAmbientSound = this.audio.startLoop('boss-beast-ambient', 0.5);

    this.play('emerge', () => {
      this.stopAmbient();
      this.play(this.loop);
      onArrived();
    });
  }

  private play(anim: ZlewiatanAnim, then?: () => void, timeScale = 1): void {
    const boss = this.boss;
    if (!boss) return;
    this.flushRelease();
    const key = zlewiatanAnimKey(anim);
    boss.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    boss.play({ key, timeScale });
    if (then) boss.once(Phaser.Animations.Events.ANIMATION_COMPLETE, then);
  }

  private onFrame(anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame): void {
    const spit = anim.key.replace('zlewiatan-', '') as Spit;
    const r = ZLEWIATAN_RELEASE[spit];
    if (r && frame.index - 1 === r.frame) this.flushRelease();
  }

  private flushRelease(): void {
    const release = this.release;
    this.release = null;
    release?.();
  }

  private backToLoop = (): void => this.play(this.loop);

  /** It leans in at the roach: the charge loop takes over from idle (the rage keeps its own until it calms). */
  startCharge(): void {
    if (this.loop === 'rage') return;
    this.loop = 'charge';
    this.audio.playSfx('zl-creak', VOL.boss);
    if (this.boss?.anims.getName() === zlewiatanAnimKey('idle')) this.play('charge');
  }

  /** It goes red-hot, rears and roars, then shakes in its rage until it calms. */
  enterRage(): void {
    this.loop = 'rage';
    if (!this.boss) return;
    this.audio.playSfx('zl-roar', VOL.big);
    this.play('rage-enter', this.backToLoop);
  }

  leaveRage(charging: boolean): void {
    this.loop = charging ? 'charge' : 'idle';
    const playing = this.boss?.anims.getName() ?? '';
    if (playing.endsWith('rage') || playing.endsWith('rage-enter')) this.play(this.loop);
  }

  /**
   * One head rears back (the lane's tell), and spits: `onRelease` fires on the frame the shot leaves its mouth. Shots
   * coming quicker than the spit lasts play it faster, never skipping the rear-back.
   */
  spit(head: Head, intervalMs: number, onRelease: () => void): void {
    const anim: Spit = `spit-${head}`;
    this.startSpit(anim, intervalMs, onRelease);
  }

  /** All three mouths at once, for the radiator in the rage. */
  rageSpit(intervalMs: number, onRelease: () => void): void {
    this.startSpit('rage-spit', intervalMs, onRelease);
  }

  private startSpit(anim: Spit, intervalMs: number, onRelease: () => void): void {
    if (!this.boss) {
      onRelease();
      return;
    }
    const { frames, fps } = ZLEWIATAN_ANIMS[anim];
    const lasts = (frames * 1000) / fps;
    const speed = Phaser.Math.Clamp(lasts / Math.max(1, intervalMs), 1, SPIT_MAX_SPEEDUP);
    this.play(anim, this.backToLoop, speed);
    this.release = onRelease;
  }

  /** How long until a spit started now lets its shot go, ms, at the speed it would play at. */
  releaseDelay(head: Head | 'rage', intervalMs: number): number {
    const anim: Spit = head === 'rage' ? 'rage-spit' : `spit-${head}`;
    const { frames, fps } = ZLEWIATAN_ANIMS[anim];
    const speed = Phaser.Math.Clamp((frames * 1000) / fps / Math.max(1, intervalMs), 1, SPIT_MAX_SPEEDUP);
    return (ZLEWIATAN_RELEASE[anim].frame * 1000) / fps / speed;
  }

  /** A hit: the whole creature flinches, flashed pale, unless a head is busy spitting (the tell comes first). */
  hurt(): void {
    const playing = this.boss?.anims.getName() ?? '';
    if (playing === zlewiatanAnimKey('idle') || playing === zlewiatanAnimKey('charge')) this.play('hurt', this.backToLoop);
  }

  /** The last hit: it drains away down the drain. */
  drainAway(onDone: () => void): void {
    if (!this.boss) {
      onDone();
      return;
    }
    this.release = null;
    this.audio.playSfx('zl-drain-away', VOL.boss);
    this.play('defeat', onDone);
  }

  stopAmbient(): void {
    this.audio.stopLoop(this.beastAmbientSound);
    this.beastAmbientSound = null;
  }

  updateGodray(): void {
    if (!this.godray || !this.godray.active) return;
    const cam = this.scene.cameras.main;
    if (this.pistol) this.rayAt = { x: this.pistol.x - cam.scrollX, y: this.pistol.y - cam.scrollY };
    const cx = this.rayAt?.x ?? cam.width / 2;
    const cy = this.rayAt?.y ?? cam.height / 2;
    const time = this.scene.time.now;

    this.godray.clear();
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + time * 0.0005;
      this.godray.lineStyle(3, 0xffff88, 0.3);
      this.godray.lineBetween(cx, cy, cx + Math.cos(angle) * 200, cy + Math.sin(angle) * 200);
    }
  }

  spawnExplosion(x: number, y: number): void {
    const exp = this.scene.add.image(x, y, `boss-explosion${Phaser.Math.Between(1, 3)}`);
    exp.setScale(0.3).setDepth(DEPTH.VFX_TEXT);
    this.scene.tweens.add({
      targets: exp,
      alpha: 0,
      scale: 0.6,
      duration: 300,
      onComplete: () => exp.destroy(),
    });
  }

  explodeAroundBoss(spread: number): void {
    if (!this.boss) return;
    this.spawnExplosion(
      this.boss.x - 60 + Phaser.Math.Between(-spread, spread),
      this.boss.y + Phaser.Math.Between(-spread, spread),
    );
  }

  showProjectileScore(x: number, y: number, points: number): void {
    const popup = this.scene.add.text(x, y - 15, `+${points}`, popupStyle({
      fontSize: '8px',
      color: '#ffdd00',
    }));
    popup.setOrigin(0.5).setDepth(DEPTH.POPUP);
    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 20,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });
  }

  /** The drain it went down goes, the bonus flies up and the roach celebrates, tossing the pistol away. */
  playDefeat(bonus: number): void {
    const boss = this.boss;
    if (boss?.active) {
      this.scene.tweens.add({
        targets: boss,
        alpha: 0,
        duration: 400,
        onComplete: () => boss.destroy(),
      });
    }

    this.audio.playSfx('boss-victory', VOL.stinger);

    const cam = this.scene.cameras.main;
    const bonusText = this.scene.add.text(cam.width / 2, cam.height / 2, `+${bonus}`, popupStyle({
      fontSize: '32px',
      color: '#ffff00',
      strokeThickness: 6,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

    this.scene.tweens.add({
      targets: bonusText,
      y: bonusText.y - 60,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.5 },
      duration: 1500,
      ease: 'Power2',
      onComplete: () => bonusText.destroy(),
    });

    this.player.celebrate();
  }

  private destroyPistol(): void {
    this.pistol?.destroy();
    this.pistol = null;
  }

  destroy(): void {
    this.release = null;
    if (this.boss?.active) this.boss.destroy();
    this.destroyPistol();
    if (this.godray?.active) this.godray.destroy();
    this.stopAmbient();
  }
}
