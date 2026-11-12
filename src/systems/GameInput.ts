/** Turns keyboard, pointer and touch input into player actions. */
import Phaser from 'phaser';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { Player } from '../objects/Player';
import { TouchControls } from '../ui/TouchControls';
import { BossEncounter } from './BossEncounter';
import type { BossFight } from './boss/BossFight';
import { PauseManager } from './PauseManager';
import { RunState } from './RunState';

const { JustDown } = Phaser.Input.Keyboard;

export class GameInput {
  private run: RunState;
  private player: Player;
  private pauseManager: PauseManager;
  private eventBridge: GameEventBridge;
  private boss: BossEncounter;
  private touchControls: TouchControls;
  /** Whether each earned button has been shown yet: its first showing pops in, once. */
  private dashShown: boolean;
  private gunShown: boolean;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey: Phaser.Input.Keyboard.Key;
  private rightKey: Phaser.Input.Keyboard.Key;
  private escKey: Phaser.Input.Keyboard.Key;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    player: Player,
    pauseManager: PauseManager,
    eventBridge: GameEventBridge,
    boss: BossEncounter,
  ) {
    this.run = run;
    this.player = player;
    this.pauseManager = pauseManager;
    this.eventBridge = eventBridge;
    this.boss = boss;
    this.dashShown = run.abilities.canDash;
    this.gunShown = run.abilities.canShoot;

    const isMobile = !scene.sys.game.device.os.desktop;

    this.touchControls = new TouchControls(scene, isMobile, {
      onSwap: () => this.swapLane(),
      onDash: () => (this.boss.activeFight ? this.fightDash() : this.dash()),
      onShoot: () => this.fightShoot(),
      isDisabled: () => this.isBlocked,
      isDashAllowed: () => this.dashAllowed,
    });
    this.touchControls.create();

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  layout(width: number, height: number): void {
    this.touchControls.layout(width, height);
  }

  pausePressed(): boolean {
    return JustDown(this.escKey);
  }

  /** Reads every key and so drops it, and hides the touch buttons: what is pressed under the versus splash is not the fight's. */
  discardInput(): void {
    this.touchControls.setDashVisible(false);
    this.touchControls.setGunVisible(false);
    JustDown(this.cursors.up);
    JustDown(this.cursors.down);
    JustDown(this.rightKey);
    JustDown(this.spaceKey);
    JustDown(this.escKey);
  }

  handleRunKeys(): void {
    this.showDashButton(this.run.abilities.canDash);
    this.touchControls.setDashCharge(this.player.dashCharge);
    this.touchControls.setGunVisible(false);
    // JustDown consumes the press, so every key is read each frame; space has no use in the run yet
    const up = JustDown(this.cursors.up);
    const down = JustDown(this.cursors.down);
    const dash = JustDown(this.rightKey);
    JustDown(this.spaceKey);
    this.hopOrDrop(up, down);
    if (dash && this.dashAllowed) this.dash();
  }

  /** Lanes as in the run; the gun and the dash only in fights that have them, and their buttons only show there. */
  handleBossKeys(fight: BossFight): void {
    if (this.boss.isSplashing) {
      this.discardInput();
      return;
    }
    this.showDashButton(fight.dash !== undefined && this.run.abilities.canDash);
    this.showGunButton(fight.shoot !== undefined && this.run.abilities.canShoot);
    if (fight.dash) this.touchControls.setDashCharge(this.player.dashCharge);
    const up = JustDown(this.cursors.up);
    const down = JustDown(this.cursors.down);
    const shot = JustDown(this.spaceKey);
    const dash = JustDown(this.rightKey);
    // Only allow input during active fighting (not intro/victory/resuming)
    if (!fight.inputLive) return;
    this.hopOrDrop(up, down);
    if (shot) this.fightShoot();
    if (dash && this.dashAllowed) this.fightDash();
  }

  /** The dash button, for as long as the run owns the dash. Earned mid-run, it pops in the first time it shows. */
  private showDashButton(visible: boolean): void {
    this.touchControls.setDashVisible(visible);
    if (visible && !this.dashShown) {
      this.dashShown = true;
      this.touchControls.popIn('dash');
    }
  }

  private showGunButton(visible: boolean): void {
    this.touchControls.setGunVisible(visible);
    if (visible && !this.gunShown) {
      this.gunShown = true;
      this.touchControls.popIn('gun');
    }
  }

  private fightShoot(): void {
    const fight = this.boss.activeFight;
    if (fight?.inputLive && this.run.abilities.canShoot) fight.shoot?.();
  }

  private fightDash(): void {
    const fight = this.boss.activeFight;
    if (fight?.inputLive) fight.dash?.();
  }

  private get dashAllowed(): boolean {
    return this.run.abilities.canDash && this.player.dashReady && !this.player.isDashing;
  }

  spectatePreviousPressed(): boolean {
    return JustDown(this.cursors.left) || JustDown(this.cursors.up);
  }

  spectateNextPressed(): boolean {
    return JustDown(this.cursors.right) || JustDown(this.cursors.down);
  }

  private get isBlocked(): boolean {
    return this.run.isDead || this.pauseManager.isPaused || this.run.isCountingDown || this.pauseManager.isUnpauseCountdown || this.boss.isSplashing;
  }

  /** Up only counts on the bottom lane and down only on the top one: the other does nothing at all. */
  private hopOrDrop(up: boolean, down: boolean): void {
    const floor = this.player.currentFloor;
    if ((up && floor === 'bottom') || (down && floor === 'top')) this.swapLane();
  }

  private swapLane(): void {
    this.player.swapLane();
    this.eventBridge.onSwap(this.player.currentFloor, this.player.x);
  }

  private dash(): void {
    this.player.startDash();
    this.eventBridge.onDashStart(this.player.x);
  }
}
