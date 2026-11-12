/**
 * What the run teaches when a power is earned, so the first use is safe. The dash: right after the reward, a single wall
 * (both lanes shut, only the dash gets through) stands a few seconds ahead, with a prompt over the roach until it dashes
 * or has passed. The gun (solo; a match keeps it inside the fight): an onion stands in the roach's lane with apples
 * behind it, the shot's keycap over the roach until the onion is shot or passed.
 *
 * The moult, and the gun in a match, get a one-line hint that fades (no course changes). The opening lesson on lane hops is
 * `Tutorial`; both draw their prompts with the same keycap.
 */
import Phaser from 'phaser';
import { addArrowKeycap, addKeycap, keycapBob, type ArrowKeycap } from '../ui/Keycap';
import { Player } from '../objects/Player';
import { SpawnManager } from './SpawnManager';
import type { AbilityId } from './abilities';

/** The prompt shows once the wall is this close ahead of the roach, and goes this far past it. */
const SHOW_WITHIN_PX = 560;
const GONE_PAST_PX = 60;
const PROMPT_ABOVE_PX = 96;
/** A one-line hint stands this far from the top, for this long, then fades. */
const HINT_Y = 150;
const HINT_MS = 4500;
const HINT_FADE_MS = 500;

export class AbilityLessons {
  private scene: Phaser.Scene;
  private player: Player;
  private spawnManager: SpawnManager;
  private touch: boolean;
  private wallX = 0;
  /** What the lesson waits for: the dash's wall, or the gun's onion (gone once it is shot). */
  private lesson: 'dash' | 'gun' = 'dash';
  private target: Phaser.Physics.Arcade.Sprite | null = null;
  private prompt: Phaser.GameObjects.Text | ArrowKeycap | null = null;
  private hint: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, player: Player, spawnManager: SpawnManager) {
    this.scene = scene;
    this.player = player;
    this.spawnManager = spawnManager;
    this.touch = !scene.sys.game.device.os.desktop;
    scene.events.once('shutdown', () => this.dismiss());
  }

  /** A power was earned and the run is about to go on. `inRun`: the gun shoots between the fights too (solo). */
  teach(ability: AbilityId, inRun = true): void {
    if (ability === 'dash') this.teachDash();
    else if (ability === 'gun' && inRun) this.teachGun();
    // In a match the gun's button only shows inside a fight
    else if (ability === 'gun') this.showHint(this.touch ? 'Strzał: prawy dolny róg (w walkach z bossami)' : 'SPACJA — strzał (w walkach z bossami)');
    else if (ability === 'moult') this.showHint('Wylinka: jedno trafienie ci nie zaszkodzi');
  }

  private showHint(text: string): void {
    this.hint?.destroy();
    const { width } = this.scene.cameras.main;
    const hint = addKeycap(this.scene, text, '16px').setScrollFactor(0).setPosition(Math.round(width / 2), HINT_Y);
    this.hint = hint;
    this.scene.tweens.add({
      targets: hint, alpha: 0, delay: HINT_MS, duration: HINT_FADE_MS,
      onComplete: () => { hint.destroy(); if (this.hint === hint) this.hint = null; },
    });
  }

  private teachGun(): void {
    this.dismiss();
    const { x, target } = this.spawnManager.layGunLesson(this.player.x, this.player.currentFloor);
    this.lesson = 'gun';
    this.wallX = x;
    this.target = target;
    this.prompt = addKeycap(this.scene, this.touch ? 'STRZAŁ' : 'SPACJA').setVisible(false);
  }

  private teachDash(): void {
    this.dismiss();
    this.lesson = 'dash';
    this.wallX = this.spawnManager.layDashLesson(this.player.x);
    // A keycap, like the info page's: the key itself on a keyboard, the button's name on a phone
    this.prompt = (this.touch ? addKeycap(this.scene, 'DASH') : addArrowKeycap(this.scene, 'right')).setVisible(false);
  }

  /** Every frame of the run. */
  update(): void {
    const { prompt, player } = this;
    if (!prompt) return;
    const done = this.lesson === 'dash' ? player.isDashing : !this.target?.active || !this.target.body?.enable;
    if (done || player.x > this.wallX + GONE_PAST_PX) {
      this.dismiss();
      return;
    }
    const near = this.wallX - player.x < SHOW_WITHIN_PX;
    prompt.setVisible(near);
    if (near) prompt.setPosition(Math.round(player.x + keycapBob(this.scene.time.now)), Math.round(player.y - PROMPT_ABOVE_PX));
  }

  dismiss(): void {
    this.prompt?.destroy();
    this.prompt = null;
    this.target = null;
    if (this.hint) this.scene.tweens.killTweensOf(this.hint);
    this.hint?.destroy();
    this.hint = null;
  }
}
