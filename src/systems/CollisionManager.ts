import Phaser from 'phaser';
import { Player, Floor } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { GameHUD } from '../ui/GameHUD';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { APPLE_SCORE, PILL_SCORE, TYSKIE_SCORE, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

export class CollisionManager {
  private scene: Phaser.Scene;
  private player: Player;
  private vfx: VisualEffects;
  private audio: AudioManager;
  private hud: GameHUD;
  private isMultiplayer: boolean;

  // Callbacks
  private onDie: (obstacleType?: string | null) => void;
  private getPickupCombo: () => number;
  private setPickupCombo: (val: number) => void;
  private getScore: () => number;
  private setScore: (val: number) => void;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    vfx: VisualEffects,
    audio: AudioManager,
    hud: GameHUD,
    isMultiplayer: boolean,
    callbacks: {
      onDie: (obstacleType?: string | null) => void;
      getPickupCombo: () => number;
      setPickupCombo: (val: number) => void;
      getScore: () => number;
      setScore: (val: number) => void;
    },
  ) {
    this.scene = scene;
    this.player = player;
    this.vfx = vfx;
    this.audio = audio;
    this.hud = hud;
    this.isMultiplayer = isMultiplayer;
    this.onDie = callbacks.onDie;
    this.getPickupCombo = callbacks.getPickupCombo;
    this.setPickupCombo = callbacks.setPickupCombo;
    this.getScore = callbacks.getScore;
    this.setScore = callbacks.setScore;
  }

  /** Set up all physics colliders and overlaps. */
  setupCollisions(
    floorTopBody: Phaser.GameObjects.Rectangle,
    floorBottomBody: Phaser.GameObjects.Rectangle,
    obstacles: Phaser.Physics.Arcade.Group,
    apples: Phaser.Physics.Arcade.Group,
    tyskies: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
  ): void {
    const physics = this.scene.physics;

    // Floor colliders with process callbacks
    physics.add.collider(this.player.sprite, floorTopBody, undefined, () => {
      return this.player.currentFloor === 'top';
    }, this);
    physics.add.collider(this.player.sprite, floorBottomBody, undefined, () => {
      return this.player.currentFloor === 'bottom';
    }, this);

    // Overlap detectors
    physics.add.overlap(
      this.player.sprite,
      apples,
      this.collectApple as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    physics.add.overlap(
      this.player.sprite,
      tyskies,
      this.collectTyskie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    physics.add.overlap(
      this.player.sprite,
      pills,
      this.collectPill as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    physics.add.overlap(
      this.player.sprite,
      obstacles,
      this.hitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      (_cockroach, obstacle) => {
        if (this.player.isDashing || this.player.isInvulnerable) return false;
        const obstacleFloor = (obstacle as Phaser.Physics.Arcade.Sprite).getData('floor');
        return !obstacleFloor || obstacleFloor === this.player.currentFloor;
      },
      this,
    );
  }

  /** Combo multiplier: 10 combo = 1.5x, 20 combo = 2.0x, etc. */
  getComboMultiplier(): number {
    return 1 + this.getPickupCombo() * 0.025;
  }

  private collectApple(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = apple as Phaser.Physics.Arcade.Sprite;
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.audio.playApple();
    sprite.destroy();

    this.setPickupCombo(this.getPickupCombo() + 1);
    const multiplier = this.getComboMultiplier();
    const points = Math.round(APPLE_SCORE * multiplier);
    this.setScore(this.getScore() + points);
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x, this.getScore());

    const combo = this.getPickupCombo();
    const comboColor = combo >= 10 ? '#ff00ff' : combo >= 5 ? '#ffff00' : '#00ff00';
    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, comboColor);
    this.hud.updateScore(this.getScore());
  }

  private collectTyskie(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    tyskie: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = tyskie as Phaser.Physics.Arcade.Sprite;
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.scene.sound.play('burp', { volume: 0.8 });
    sprite.destroy();

    this.setPickupCombo(this.getPickupCombo() + 1);
    const multiplier = this.getComboMultiplier();
    const points = Math.round(TYSKIE_SCORE * multiplier);
    this.setScore(this.getScore() + points);
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x, this.getScore());

    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, '#ffdd00');
    this.hud.updateScore(this.getScore());
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

    // Score with combo
    this.setPickupCombo(this.getPickupCombo() + 1);
    const multiplier = this.getComboMultiplier();
    const pillPoints = Math.round(PILL_SCORE * multiplier);
    this.setScore(this.getScore() + pillPoints);
    this.hud.updateScore(this.getScore());

    // VFX
    this.vfx.appleCollectEffect(px, py);

    // Activate pill on player
    this.player.activatePill(px, py);

    if (this.isMultiplayer) {
      mpClient.sendPickup(px, this.getScore());
      mpClient.sendPillStart();
    }
  }

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
    this.onDie(obstacleType);
  }

  private showPickupPopup(x: number, y: number, text: string, color: string): void {
    const popup = this.scene.add.text(x, y - 20, text, popupStyle({ color }));
    popup.setOrigin(0.5);
    popup.setDepth(DEPTH.POPUP);
    popup.setAlpha(0);

    // Phase 1: Slide up + fade in (150ms)
    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 15,
      alpha: 1,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        // Phase 2: Wobble in place (300ms)
        this.scene.tweens.add({
          targets: popup,
          angle: { from: -3, to: 3 },
          duration: 75,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 3: Slide up + fade out (150ms)
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
