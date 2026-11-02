import Phaser from 'phaser';
import { APPLE_SCORE, PILL_SCORE, BEER_SCORE, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
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
  onPickupCollected?: (x: number, y: number, textureKey: string) => void;
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
        if (this.player.isDashing || this.player.isInvulnerable) return false;
        const obstacleFloor = (obstacle as Phaser.Physics.Arcade.Sprite).getData('floor');
        return !obstacleFloor || obstacleFloor === this.player.currentFloor;
      },
      this,
    );
  }

  setupFloorColliders(
    floorTopBody: Phaser.GameObjects.Rectangle,
    floorBottomBody: Phaser.GameObjects.Rectangle,
  ): void {
    this.scene.physics.add.collider(this.player.sprite, floorTopBody, undefined, () => {
      return this.player.currentFloor === 'top';
    }, this.scene);
    this.scene.physics.add.collider(this.player.sprite, floorBottomBody, undefined, () => {
      return this.player.currentFloor === 'bottom';
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
    this.callbacks.onPickupCollected?.(px, py, sprite.texture.key);
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

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
    this.callbacks.onDie(obstacleType);
  }

  private showPickupPopup(x: number, y: number, text: string, color: string): void {
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
