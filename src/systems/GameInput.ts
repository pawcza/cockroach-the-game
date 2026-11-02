/** Turns keyboard, pointer and touch input into player actions. */
import Phaser from 'phaser';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { Player } from '../objects/Player';
import { GameHUD } from '../ui/GameHUD';
import { TouchControls } from '../ui/TouchControls';
import { BossEncounter } from './BossEncounter';
import { BossFight } from './BossFight';
import { PauseManager } from './PauseManager';
import { RunState } from './RunState';

const { JustDown } = Phaser.Input.Keyboard;

export class GameInput {
  private scene: Phaser.Scene;
  private run: RunState;
  private player: Player;
  private hud: GameHUD;
  private pauseManager: PauseManager;
  private eventBridge: GameEventBridge;
  private boss: BossEncounter;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey: Phaser.Input.Keyboard.Key;
  private ctrlKey: Phaser.Input.Keyboard.Key;
  private shiftKey: Phaser.Input.Keyboard.Key;
  private rightKey: Phaser.Input.Keyboard.Key;
  private escKey: Phaser.Input.Keyboard.Key;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    player: Player,
    hud: GameHUD,
    pauseManager: PauseManager,
    eventBridge: GameEventBridge,
    boss: BossEncounter,
  ) {
    this.scene = scene;
    this.run = run;
    this.player = player;
    this.hud = hud;
    this.pauseManager = pauseManager;
    this.eventBridge = eventBridge;
    this.boss = boss;

    const isMobile = !scene.sys.game.device.os.desktop;

    new TouchControls(scene, isMobile, {
      onSwap: () => this.swapLane(),
      onDash: () => {
        const fight = this.boss.activeFight;
        if (fight) {
          fight.shoot();
          return;
        }
        this.dash();
      },
      isDisabled: () => this.isBlocked,
      isDashAllowed: () => {
        if (this.boss.isActive) return true;
        return this.player.dashReady && !this.player.isDashing;
      },
    }).create();

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Desktop pointer swaps lanes; mobile uses the touch button
    if (!isMobile) {
      scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointer(pointer));
    }
  }

  pausePressed(): boolean {
    return JustDown(this.escKey);
  }

  handlePausedKeys(): void {
    this.pauseManager.handlePausedInput(
      this.scene.input.keyboard!.keys,
      Phaser.Input.Keyboard.KeyCodes.ESC,
      () => this.pauseManager.toggle(),
    );
  }

  handleRunKeys(): void {
    if (this.swapPressed()) this.swapLane();
    if (this.dashPressed() && this.player.dashReady && !this.player.isDashing) this.dash();
  }

  handleBossKeys(fight: BossFight): void {
    // Only allow input during active fighting (not intro/victory/resuming)
    if (!fight.isFighting) return;
    if (this.swapPressed()) this.swapLane();
    if (this.dashPressed()) fight.shoot();
  }

  spectatePreviousPressed(): boolean {
    return JustDown(this.cursors.left) || JustDown(this.cursors.up);
  }

  spectateNextPressed(): boolean {
    return JustDown(this.cursors.right) || JustDown(this.cursors.down);
  }

  private get isBlocked(): boolean {
    return this.run.isDead || this.pauseManager.isPaused || this.run.isCountingDown || this.pauseManager.isUnpauseCountdown;
  }

  private swapPressed(): boolean {
    // JustDown consumes the press, so both pairs must always be read.
    const jumpPressed = JustDown(this.spaceKey) || JustDown(this.cursors.up);
    const dropPressed = JustDown(this.ctrlKey) || JustDown(this.cursors.down);
    return jumpPressed || dropPressed;
  }

  private dashPressed(): boolean {
    return JustDown(this.shiftKey) || JustDown(this.rightKey);
  }

  private swapLane(): void {
    this.player.swapLane();
    this.eventBridge.onSwap(this.player.currentFloor, this.player.x);
  }

  private dash(): void {
    this.player.startDash();
    this.eventBridge.onDashStart(this.player.x);
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    if (this.isBlocked) return;

    const pauseBtn = this.hud.pauseButton;
    const pauseDist = Phaser.Math.Distance.Between(pointer.x, pointer.y, pauseBtn.x, pauseBtn.y);
    if (pauseDist <= pauseBtn.radius) return;

    this.swapLane();
  }
}
