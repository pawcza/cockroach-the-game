import Phaser from 'phaser';
import { APPLE_SCORE, PILL_SCORE, TYSKIE_SCORE, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { mpClient } from '../multiplayer/MultiplayerClient';

export interface CollisionCallbacks {
  getScore: () => number;
  addScore: (points: number) => void;
  getPickupCombo: () => number;
  incrementCombo: () => void;
  getComboMultiplier: () => number;
  isMultiplayer: boolean;
  onDie: (obstacleType?: string | null) => void;
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
    tyskies: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    obstacles: Phaser.Physics.Arcade.Group,
  ): void {
    this.scene.physics.add.overlap(
      this.player.sprite, apples,
      this.collectApple as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );
    this.scene.physics.add.overlap(
      this.player.sprite, tyskies,
      this.collectTyskie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
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

  private collectApple(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = apple as Phaser.Physics.Arcade.Sprite;
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.audio.playApple();
    sprite.destroy();

    this.callbacks.incrementCombo();
    const multiplier = this.callbacks.getComboMultiplier();
    const points = Math.round(APPLE_SCORE * multiplier);
    this.callbacks.addScore(points);
    if (this.callbacks.isMultiplayer) mpClient.sendPickup(sprite.x, this.callbacks.getScore());

    const combo = this.callbacks.getPickupCombo();
    const comboColor = combo >= 10 ? '#ff00ff' : combo >= 5 ? '#ffff00' : '#00ff00';
    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, comboColor);
  }

  private collectTyskie(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    tyskie: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = tyskie as Phaser.Physics.Arcade.Sprite;
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.scene.sound.play('burp', { volume: 0.8 });
    sprite.destroy();

    this.callbacks.incrementCombo();
    const multiplier = this.callbacks.getComboMultiplier();
    const points = Math.round(TYSKIE_SCORE * multiplier);
    this.callbacks.addScore(points);
    if (this.callbacks.isMultiplayer) mpClient.sendPickup(sprite.x, this.callbacks.getScore());

    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, '#ffdd00');
  }

  private collectPill(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pill: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = pill as Phaser.Physics.Arcade.Sprite;
    const px = sprite.x;
    const py = sprite.y;

    const glowTween = sprite.getData('glowTween');
    if (glowTween) glowTween.destroy();
    sprite.destroy();

    this.callbacks.incrementCombo();
    const multiplier = this.callbacks.getComboMultiplier();
    const pillPoints = Math.round(PILL_SCORE * multiplier);
    this.callbacks.addScore(pillPoints);
    if (this.callbacks.isMultiplayer) mpClient.sendPickup(px, this.callbacks.getScore());

    this.vfx.appleCollectEffect(px, py);
    this.player.activatePill(px, py);

    if (this.callbacks.isMultiplayer) {
      mpClient.sendPillStart();
    }
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
