import Phaser from 'phaser';
import { APPLE_SCORE, PILL_SCORE, BEER_SCORE } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager, VOL } from '../audio/AudioManager';
import { popup } from '../effects/Popup';
import { punt } from '../effects/Punt';
import { Hold, holdOn, settleHold, shiftHold } from './dashGrace';

/** The burp follows the beer's clink by this long. */
const BURP_DELAY_MS = 280;

export interface CollisionCallbacks {
  getScore: () => number;
  addScore: (points: number) => void;
  getPickupCombo: () => number;
  incrementCombo: () => void;
  getComboMultiplier: () => number;
  onAppleCollected: () => void;
  onBeerCollected: () => void;
  onPillCollected: () => void;
  onPickup: (x: number, score: number) => void;
  onPillStart: () => void;
  /** What killed the roach: its type, and the obstacle itself (for the hit-stop's flash). */
  onDie: (obstacleType?: string | null, culprit?: Phaser.Physics.Arcade.Sprite) => void;
  /** The roach has a dash to give right now (owned, ready, not already on). */
  dashAvailable: () => boolean;
  /** A hit that would kill: true when the wylinka took it (its shell is shed, and the obstacle is punted instead). */
  survivesHit: (obstacle?: Phaser.Physics.Arcade.Sprite) => boolean;
  onPickupCollected?: (x: number, y: number, frameName: string) => void;
  onDashThrough: (obstacle: Phaser.Physics.Arcade.Sprite) => void;
  /** False while nothing scores (the tutorial): a pickup still counts in the combo, but adds no points and shows none. */
  scoring?: () => boolean;
}

export class CollisionManager {
  /** The lethal touches held for a dash that may come (dashGrace.ts): at most one hold at a time. */
  private hold: { rules: Hold; sprites: Phaser.Physics.Arcade.Sprite[] } | null = null;
  /** The swap (its press time) that had its hold: it earns no second one. */
  private spentFor: number | null = null;
  private scene: Phaser.Scene;
  private player: Player;
  private vfx: VisualEffects;
  private audio: AudioManager;
  private callbacks: CollisionCallbacks;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    vfx: VisualEffects,
    audio: AudioManager,
    callbacks: CollisionCallbacks,
  ) {
    this.scene = scene;
    this.player = player;
    this.vfx = vfx;
    this.audio = audio;
    this.callbacks = callbacks;
  }

  setupOverlaps(
    apples: Phaser.Physics.Arcade.Group,
    beers: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    obstacles: Phaser.Physics.Arcade.Group,
  ): void {
    this.scene.events.on('update', this.settle, this);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', this.settle, this));
    this.scene.physics.add.overlap(
      this.player.sprite, apples,
      this.collectApple as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );
    this.scene.physics.add.overlap(
      this.player.sprite, beers,
      this.collectBeer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );
    this.scene.physics.add.overlap(
      this.player.sprite, pills,
      this.collectPill as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );
    this.scene.physics.add.overlap(
      this.player.sprite, obstacles,
      this.hitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      (_cockroach, obstacle) => {
        const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
        // A hazard that is no thing (the light flooding a lane) is passed through on a pill or a dash, never punted
        if (sprite.getData('unpuntable') && (this.player.crushesObstacles || this.player.isDashing)) return false;
        if (this.player.crushesObstacles) {
          this.crushObstacle(sprite);
          return false;
        }
        // An enemy between attacks (a raised slipper, a bird up high, a cat in mid-air) can't hurt and isn't punted. A
        // wall's cloud is the exception for a dash: it may go through the wall while it is open, and takes it down
        if (sprite.getData('harmless') && !(this.player.isDashing && sprite.getData('partOf'))) return false;
        const obstacleFloor = sprite.getData('floor');
        const inLane = !obstacleFloor || obstacleFloor === this.player.currentFloor;
        if (this.player.isDashing) {
          if (inLane) {
            this.callbacks.onDashThrough(sprite);
            this.crushObstacle(sprite);
          }
          return false;
        }
        if (this.player.isInvulnerable) return false;
        // Swapped lane a moment ago and the dash is a key press away: the touch is held for it (dashGrace.ts)
        if (inLane && this.holds(sprite)) return false;
        return inLane;
      },
      this,
    );
  }

  /**
   * A lethal touch soon after a lane swap is held while a dash could still save the roach (dashGrace.ts). Everything
   * that touches during the hold shares it; `settleHold` ends it by its own clock, whatever the overlap does.
   */
  private holds(sprite: Phaser.Physics.Arcade.Sprite): boolean {
    const hop = this.player.lastHop;
    const held = holdOn(this.scene.time.now, this.hold?.rules ?? null, hop?.at ?? null, this.spentFor, this.callbacks.dashAvailable());
    if (!held) return false;
    if (!this.hold) {
      this.hold = { rules: held, sprites: [] };
      this.spentFor = hop?.at ?? null;
    }
    if (!this.hold.sprites.includes(sprite)) {
      this.hold.sprites.push(sprite);
      // A held obstacle was not dodged: no close call for it
      sprite.setData('dashGrace', true);
    }
    return true;
  }

  /** Every frame: a hold comes to its end, a dash that began inside it punts what was held, or its time is up and it kills. */
  private settle(): void {
    const hold = this.hold;
    if (!hold) return;
    const { player } = this;
    // What the roach (or a pill) punted is settled; what fell with its ledge in the meantime still touched the roach
    const live = hold.sprites.filter(sprite => sprite.active && !sprite.getData('punted'));
    // The run is over, or what was held is gone (a boss cleared the arena, a pill punted it): nothing is left to settle
    if (live.length === 0 || player.isDead) {
      this.hold = null;
      return;
    }
    const dashedAt = player.dashStartTime > 0 ? player.dashStartTime : null;
    const verdict = settleHold(this.scene.time.now, hold.rules, dashedAt);
    if (verdict === 'wait') return;
    this.hold = null;
    // What touched the roach is settled as it touched it: swapping out of the lane afterwards is no way out of it
    const here = live;
    if (verdict === 'punt' || player.crushesObstacles) {
      for (const sprite of here) {
        if (verdict === 'punt') this.callbacks.onDashThrough(sprite);
        this.crushObstacle(sprite);
      }
      return;
    }
    if (player.isInvulnerable) return;
    const body = (s: Phaser.Physics.Arcade.Sprite) => s as Phaser.Types.Physics.Arcade.GameObjectWithBody;
    // Each one that touched counts, as each would have at its own touch (a moult takes one blow, a death ends the run)
    for (const sprite of here) {
      if (player.isDead) break;
      this.hitObstacle(body(player.sprite), body(sprite));
    }
  }

  /** The game stood still for `ms` (the pause): a hold's wait is what it was. */
  adjustForPause(ms: number): void {
    if (this.hold) this.hold = { ...this.hold, rules: shiftHold(this.hold.rules, ms) };
  }

    setupFloorColliders(
    floorTopBody: Phaser.GameObjects.Rectangle,
    floorBottomBody: Phaser.GameObjects.Rectangle,
  ): void {
    // Mid-hop the roach passes through the top ledge on its way up, so neither floor holds it until it lands
    this.scene.physics.add.collider(this.player.sprite, floorTopBody, undefined, () => {
      return this.player.currentFloor === 'top' && !this.player.isHopping;
    }, this.scene);
    this.scene.physics.add.collider(this.player.sprite, floorBottomBody, undefined, () => {
      return this.player.currentFloor === 'bottom' && !this.player.isHopping;
    }, this.scene);
  }

  private collectPickup(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pickup: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    config: {
      sound?: () => void;
      score: number;
      popupColor?: string | (() => string);
      onCollected: () => void;
      afterScore?: (px: number, py: number) => void;
    },
  ): void {
    const sprite = pickup as Phaser.Physics.Arcade.Sprite;
    const px = sprite.x;
    const py = sprite.y;
    this.callbacks.onPickupCollected?.(px, py, sprite.frame.name);
    config.sound?.();
    sprite.destroy();

    this.callbacks.incrementCombo();
    config.onCollected();
    const multiplier = this.callbacks.getComboMultiplier();
    const scoring = this.callbacks.scoring?.() !== false;
    const points = scoring ? Math.round(config.score * multiplier) : 0;
    if (scoring) this.callbacks.addScore(points);
    this.callbacks.onPickup(px, this.callbacks.getScore());

    config.afterScore?.(px, py);

    if (config.popupColor !== undefined && scoring) {
      const color = typeof config.popupColor === 'function' ? config.popupColor() : config.popupColor;
      this.showPickupPopup(px, py, `+${points}`, color);
    }
  }

  private collectApple(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    this.collectPickup(_cockroach, apple, {
      sound: () => this.audio.playApple(),
      score: APPLE_SCORE,
      popupColor: () => {
        const combo = this.callbacks.getPickupCombo();
        return combo >= 10 ? '#ff00ff' : combo >= 5 ? '#ffff00' : '#00ff00';
      },
      onCollected: () => this.callbacks.onAppleCollected(),
    });
  }

  private collectBeer(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    beer: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    this.collectPickup(_cockroach, beer, {
      sound: () => {
        this.audio.playSfx('beer-sfx', VOL.pickup);
        this.scene.time.delayedCall(BURP_DELAY_MS, () => this.audio.playSfx('burp', VOL.pickup));
      },
      score: BEER_SCORE,
      popupColor: '#ffdd00',
      onCollected: () => this.callbacks.onBeerCollected(),
    });
  }

  private collectPill(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pill: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    this.collectPickup(_cockroach, pill, {
      score: PILL_SCORE,
      onCollected: () => this.callbacks.onPillCollected(),
      afterScore: (px, py) => {
        this.player.activatePill(px, py);
        this.callbacks.onPillStart();
      },
    });
  }

  /**
   * On the pill, dashing through, or shedding its shell, the roach punts what it hits: a spark and a poof, then up and ahead, gone. Cosmetic and local, so no seeded
   * randomness; the obstacle stops colliding at once.
   */
  private crushObstacle(struck: Phaser.Physics.Arcade.Sprite): void {
    // What is hit may be one part of something bigger (a cloud of the spray wall): the whole of it goes
    const obstacle = (struck.getData('partOf') as Phaser.Physics.Arcade.Sprite | undefined) ?? struck;
    if (obstacle.getData('falling') || !obstacle.active) return;
    obstacle.setData('falling', true);
    obstacle.setData('punted', true);
    obstacle.emit('crushed');
    (obstacle.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.killTweensOf(obstacle);
    (obstacle.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setVisible(false);
    // The hit: a spark where it was struck, a poof, a thud; it flies off unturned
    punt(this.scene, this.audio, obstacle, { x: struck.x, y: struck.getCenter().y });
  }

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
    if (this.callbacks.survivesHit(sprite)) {
      this.crushObstacle(sprite);
      return;
    }
    this.callbacks.onDie(sprite.getData('type') || null, sprite);
  }

  /** A score on its pixel plate, rising off the pickup (or the close call) and going. */
  showPickupPopup(x: number, y: number, text: string, color: string): void {
    popup(this.scene, x, y - 20, text, popupStyle({ color }), { hold: 150 });
  }
}
