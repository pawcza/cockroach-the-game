import Phaser from 'phaser';
import { APPLE_SCORE, PILL_SCORE, BEER_SCORE, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
/** How far a punted obstacle flies, and for how long. Ahead of the roach, so it stays in view as it spins off. */
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
  onDie: (obstacleType?: string | null) => void;
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
        if (this.player.crushesObstacles) {
          this.crushObstacle(obstacle as Phaser.Physics.Arcade.Sprite);
          return false;
        }
        const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
        const obstacleFloor = sprite.getData('floor');
        const inLane = !obstacleFloor || obstacleFloor === this.player.currentFloor;
        if (this.player.isDashing) {
          if (inLane) this.callbacks.onDashThrough(sprite);
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
    this.vfx.pickupCollectEffect(px, py);
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
      sound: () => this.audio.playSfx('burp', 0.8),
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
   * On the pill the roach punts whatever it runs into: up and ahead, spinning, gone. Cosmetic and local, so no seeded
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
    const spin = Math.random() > 0.5 ? 1 : -1;
    this.scene.tweens.add({
      targets: obstacle,
      x: obstacle.x + CRUSH_FLING_X + Math.random() * 200,
      angle: spin * (540 + Math.random() * 360),
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
    const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
    this.callbacks.onDie(obstacleType);
  }

  showPickupPopup(x: number, y: number, text: string, color: string): void {
    const popup = this.scene.add.text(x, y - 20, text, popupStyle({ color }));
    popup.setOrigin(0.5);
    popup.setDepth(DEPTH.POPUP);
    popup.setAlpha(0);

    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 15,
      alpha: 1,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        this.scene.tweens.add({
          targets: popup,
          angle: { from: -3, to: 3 },
          duration: 75,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.scene.tweens.add({
              targets: popup,
              y: popup.y - 20,
              alpha: 0,
              duration: 150,
              ease: 'Power2',
              onComplete: () => popup.destroy(),
            });
          },
        });
      },
    });
  }
}
