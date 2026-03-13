import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { TouchControls } from '../ui/TouchControls';
import { GameHUD } from '../ui/GameHUD';
import { mpClient } from '../multiplayer/MultiplayerClient';

export interface InputState {
  jumpPressed: boolean;
  dropPressed: boolean;
  dashPressed: boolean;
  escPressed: boolean;
}

export class InputManager {
  private scene: Phaser.Scene;
  private player: Player;
  private touchControls: TouchControls;
  private hud: GameHUD;
  private isMultiplayer: boolean;
  private isMobile: boolean;

  // Keys
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private ctrlKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  // Accessors for spectating controls
  get cursorKeys(): Phaser.Types.Input.Keyboard.CursorKeys { return this.cursors; }

  constructor(
    scene: Phaser.Scene,
    player: Player,
    touchControls: TouchControls,
    hud: GameHUD,
    isMultiplayer: boolean,
    isMobile: boolean,
    isDisabled: () => boolean,
  ) {
    this.scene = scene;
    this.player = player;
    this.touchControls = touchControls;
    this.hud = hud;
    this.isMultiplayer = isMultiplayer;
    this.isMobile = isMobile;

    // Create key bindings
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.shiftKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.rightKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Pointer handler for lane swap (desktop only -- mobile uses button)
    if (!isMobile) {
      scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (isDisabled()) return;

        // Ignore taps on dash button / pause button
        const dashBtn = touchControls.dashButton;
        const dbX = dashBtn.x - dashBtn.width / 2;
        const dbY = dashBtn.y - dashBtn.height / 2;
        if (pointer.x >= dbX && pointer.x <= dbX + dashBtn.width &&
            pointer.y >= dbY && pointer.y <= dbY + dashBtn.height) return;
        const pauseBtn = hud.pauseButton;
        const pauseDist = Phaser.Math.Distance.Between(pointer.x, pointer.y, pauseBtn.x, pauseBtn.y);
        if (pauseDist <= pauseBtn.radius) return;

        player.swapLane();
        if (isMultiplayer) {
          mpClient.sendSwap(player.currentFloor);
        }
      });
    }
  }

  /** Poll keyboard input for the current frame. */
  poll(): InputState {
    return {
      jumpPressed:
        Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.up),
      dropPressed:
        Phaser.Input.Keyboard.JustDown(this.ctrlKey) ||
        Phaser.Input.Keyboard.JustDown(this.cursors.down),
      dashPressed:
        Phaser.Input.Keyboard.JustDown(this.shiftKey) ||
        Phaser.Input.Keyboard.JustDown(this.rightKey),
      escPressed: Phaser.Input.Keyboard.JustDown(this.escKey),
    };
  }

  /** Handle swap + dash input and send multiplayer events. */
  handleGameInput(input: InputState): void {
    if (input.jumpPressed || input.dropPressed) {
      this.player.swapLane();
      if (this.isMultiplayer) {
        mpClient.sendSwap(this.player.currentFloor);
      }
    }

    if (input.dashPressed && this.player.dashReady && !this.player.isDashing) {
      this.player.startDash();
      if (this.isMultiplayer) {
        mpClient.sendDashStart();
      }
    }
  }

  /** Check if any key was just pressed (for unpause). Returns true if a non-ESC key was pressed. */
  anyKeyJustDown(): boolean {
    const keys = this.scene.input.keyboard!.keys;
    for (const key of keys) {
      if (key && Phaser.Input.Keyboard.JustDown(key) && key.keyCode !== Phaser.Input.Keyboard.KeyCodes.ESC) {
        return true;
      }
    }
    return false;
  }
}
