import Phaser from 'phaser';
import { APPLE_SCORE, PILL_SCORE, BEER_SCORE, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager, VOL } from '../audio/AudioManager';
import { getFx } from '../effects/Fx';
import { popup } from '../effects/Popup';

/** The burp follows the beer's clink by this long. */
const BURP_DELAY_MS = 280;
/** How far a punted obstacle flies, and for how long. Ahead of the roach, so it stays in view as it flies off. */
const CRUSH_FLING_X = 500;
const CRUSH_FLING_Y = 220;
const CRUSH_MS = 750;

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
  /** A hit that would kill: true when the wylinka took it (its shell is shed, and the obstacle is punted instead). */
  survivesHit: () => boolean;
  onPickupCollected?: (x: number, y: number, frameName: string) => void;
  onDashThrough: (obstacle: Phaser.Physics.Arcade.Sprite) => void;
}

export class CollisionManager {
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
        // An enemy between attacks (a raised slipper, a bird up high, a cat in mid-air) can't hurt and isn't punted
        if (sprite.getData('harmless')) return false;
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
        return inLane;
      },
      this,
    );
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
    const points = Math.round(config.score * multiplier);
    this.callbacks.addScore(points);
    this.callbacks.onPickup(px, this.callbacks.getScore());

    config.afterScore?.(px, py);

    if (config.popupColor !== undefined) {
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
  private crushObstacle(obstacle: Phaser.Physics.Arcade.Sprite): void {
    if (obstacle.getData('falling')) return;
    obstacle.setData('falling', true);
    (obstacle.body as Phaser.Physics.Arcade.Body).enable = false;
    this.scene.tweens.killTweensOf(obstacle);
    (obstacle.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setVisible(false);
    obstacle.setDepth(DEPTH.POPUP - 1);
    this.audio.playSfx('flipper-sfx', 0.5);
    // The hit: a white-hot spark where it was struck and a poof as it leaves; it flies off unturned
    const fx = getFx(this.scene);
    const { y } = obstacle.getCenter();
    fx.play('poof', obstacle.x, y, { depth: DEPTH.POPUP - 1 });
    fx.play('spark-big', obstacle.x - 10, y, { depth: DEPTH.POPUP });
    this.scene.tweens.add({
      targets: obstacle,
      x: obstacle.x + CRUSH_FLING_X + Math.random() * 200,
      duration: CRUSH_MS,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: obstacle,
      y: obstacle.y - CRUSH_FLING_Y - Math.random() * 120,
      alpha: 0,
      duration: CRUSH_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => obstacle.destroy(),
    });
  }

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
    if (this.callbacks.survivesHit()) {
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
