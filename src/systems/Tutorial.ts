/**
 * The opening lesson, in the first seconds of a solo run on a device that has not had it: not a text screen but a safe,
 * hand-laid stretch in front of the course. An empty run with a keycap over the roach until it hops up, the same until
 * it drops back, a lone obstacle to hop (a hit punts it and the step repeats), a trail of apples across both lanes with
 * the combo hint, "Powodzenia!", and the regular course takes over. Each step moves on when the player does the thing.
 *
 * Solo only and never seeded: it exists in no multiplayer match and no Karaluch Dnia, and it draws nothing from a seed.
 * The flag is set when the last step completes (or on "Pomiń"), so quitting halfway shows it again. Step logic is in
 * `tutorialFlow`; this class is the Phaser side: prompts, the laid pieces, the grace on a hit.
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { Player } from '../objects/Player';
import { laneButtonCentre } from '../ui/TouchControls';
import { addArrowKeycap, keycapBob, pulseArrow, setArrow, type ArrowKeycap } from '../ui/Keycap';
import { bodyStyle, popupStyle, smallStyle, UI_TEXT } from '../utils/TextStyles';
import { setTutorialDone } from '../utils/Storage';
import { SpawnManager } from './SpawnManager';
import {
  COURSE_GAP_PX, TutorialFlow, applePlan, dodgeDue, hopKey, isNudging, type TutorialStep,
} from './tutorialFlow';

/** The keycap rides this far over the roach, its caption a line above that. */
const PROMPT_ABOVE_PX = 96;
const CAPTION_ABOVE_PX = 44;
/** The lesson's pieces are laid this far past the screen's right edge, so they scroll in. */
const LAY_AHEAD_PX = 30;
/** The regular course starts no nearer than this past the screen's right edge. */
const COURSE_AHEAD_PX = 100;
/** After a hit the roach blinks unhurt this long. */
const GRACE_MS = 900;
const FLASH_MS = 1200;
/** The small "Pomiń" sits in the top-left corner: the bottom edge is the level bar's, the top-right the pause button's. */
const SKIP_MARGIN_PX = 6;

export interface TutorialDeps {
  scene: Phaser.Scene;
  player: Player;
  spawnManager: SpawnManager;
  /** The pause menu has the keyboard then, and Enter there must not skip. */
  isPaused: () => boolean;
}

export class Tutorial {
  private deps: TutorialDeps;
  private touch: boolean;
  private flow = new TutorialFlow(0);
  private started = false;
  private lastNow = 0;
  private skipRequested = false;
  /** The obstacle and apples laid and still standing, to take away on a retry or a skip. */
  private obstacleSprites: Phaser.Physics.Arcade.Sprite[] = [];
  private appleSprites: Phaser.Physics.Arcade.Sprite[] = [];

  private keycap: ArrowKeycap | null = null;
  private arrow: ArrowKeycap | null = null;
  private caption: Phaser.GameObjects.Text | null = null;
  private skipLabel: Phaser.GameObjects.Text | null = null;
  private shownKey = '';
  private shownAt = 0;
  private flash: { text: string; until: number } | null = null;

  private onEnter = (): void => { if (!this.deps.isPaused()) this.skipRequested = true; };

  constructor(deps: TutorialDeps) {
    this.deps = deps;
    this.touch = !deps.scene.sys.game.device.os.desktop;
    deps.spawnManager.holdSpawning();
    deps.scene.events.once('shutdown', () => this.dismiss());
  }

  get isOver(): boolean {
    return this.flow.step === 'done';
  }

  /** The run's first frame after the countdown: the prompts come into being now. */
  private begin(now: number): void {
    const { scene } = this.deps;
    this.started = true;
    this.flow = new TutorialFlow(now);
    this.keycap = addArrowKeycap(scene, 'up').setVisible(false);
    if (this.touch) this.arrow = addArrowKeycap(scene, 'down').setScrollFactor(0).setVisible(false);
    this.caption = scene.add.text(0, 0, '', bodyStyle({ fontSize: '16px', color: UI_TEXT.bone, strokeThickness: 4 }))
      .setOrigin(0.5).setDepth(DEPTH.POPUP).setVisible(false);
    this.skipLabel = scene.add.text(0, 0, this.touch ? 'Pomiń samouczek' : 'Pomiń samouczek (Enter)', smallStyle({
      fontSize: '8px', color: UI_TEXT.bone, strokeThickness: 3, padding: { x: 14, y: 10 },
    })).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.TUTORIAL_SKIP).setInteractive({ useHandCursor: true });
    this.skipLabel.on('pointerdown', () => { if (!this.deps.isPaused()) this.skipRequested = true; });
    scene.input.keyboard?.on('keydown-ENTER', this.onEnter);
  }

  /** Every frame of the run. `now` is the run's own clock: ms of play, paused with the game. */
  update(now: number): void {
    if (this.isOver) return;
    if (!this.started) this.begin(now);
    this.lastNow = now;
    if (this.skipRequested) {
      this.skip();
      return;
    }
    const { player } = this.deps;
    const changed = this.flow.update(now, player.currentFloor, player.x);
    if (changed) this.enter(changed);
    this.draw(now);
  }

  /** Whether a hit should do no harm. On the lesson's obstacle it also repeats the step (a couple of times at most). */
  absorbHit(): boolean {
    if (!this.started || !this.flow.protects) return false;
    const { scene, player } = this.deps;
    const verdict = this.flow.hit();
    // The roach blinks unhurt, like after a moult; the caller punts the obstacle
    const blink = player.startInvulnerabilityBlink();
    scene.time.delayedCall(GRACE_MS, () => player.endInvulnerability(blink));
    if (verdict === 'retry') {
      this.flash = { text: 'Jeszcze raz!', until: this.lastNow + FLASH_MS };
      this.removeApples();
      this.layCourse();
    } else if (verdict === 'giveUp') {
      this.enter('apples');
    }
    return true;
  }

  dismiss(): void {
    this.deps.scene.input.keyboard?.off('keydown-ENTER', this.onEnter);
    for (const o of [this.keycap, this.arrow, this.caption, this.skipLabel]) o?.destroy();
    this.keycap = this.arrow = this.caption = this.skipLabel = null;
  }

  private cameraRight(): number {
    const camera = this.deps.scene.cameras.main;
    return camera.scrollX + camera.width;
  }

  private enter(step: TutorialStep): void {
    switch (step) {
      case 'obstacle':
        this.layCourse();
        break;
      case 'apples':
        // The regular course follows the last apple, off screen
        this.deps.spawnManager.resumeSpawning(Math.max(this.flow.lastAppleX + COURSE_GAP_PX, this.cameraRight() + COURSE_AHEAD_PX));
        break;
      case 'finish':
        this.cheer();
        break;
      case 'done':
        setTutorialDone(true);
        this.dismiss();
        break;
      default:
        break;
    }
  }

  /** The lone obstacle on the roach's own lane, and the apples beyond it. */
  private layCourse(): void {
    const { player, spawnManager } = this.deps;
    const lane = player.currentFloor;
    const x = this.cameraRight() + LAY_AHEAD_PX;
    this.obstacleSprites = spawnManager.layTutorialObstacle(x, lane);
    const plan = applePlan(lane, x);
    this.appleSprites = plan.map(a => spawnManager.layTutorialApple(a.x, a.lane));
    this.flow.laid(x, lane, plan[plan.length - 1].x);
  }

  private removeApples(): void {
    for (const apple of this.appleSprites) if (apple.active) apple.destroy();
    this.appleSprites = [];
  }

  private skip(): void {
    this.flow.finish();
    setTutorialDone(true);
    this.dismiss();
    for (const sprite of [...this.obstacleSprites, ...this.appleSprites]) if (sprite.active) sprite.destroy();
    this.obstacleSprites = [];
    this.appleSprites = [];
    this.deps.spawnManager.resumeSpawning(this.cameraRight() + COURSE_AHEAD_PX);
  }

  private cheer(): void {
    const { scene } = this.deps;
    const { width, height } = scene.cameras.main;
    this.caption?.setVisible(false);
    const text = scene.add.text(width / 2, height / 2 - 30, 'Powodzenia!', popupStyle({ fontSize: '24px', color: '#00ff00', strokeThickness: 6 }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.COUNTDOWN);
    scene.tweens.add({ targets: text, scale: { from: 2, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: text, alpha: 0, delay: 1200, duration: 400, onComplete: () => text.destroy() });
  }

  /** The step's prompt: what is on the keycap and the line under it, or nothing yet. */
  private promptFor(now: number): { key: string | null; line: string } | null {
    const { flow, touch } = this;
    const { player } = this.deps;
    switch (flow.step) {
      case 'hopUp':
        return flow.promptDue(now) ? { key: '↑', line: touch ? 'Dotknij, aby zmienić tor' : 'Skok na górę' } : null;
      case 'dropDown':
        return flow.promptDue(now) ? { key: '↓', line: touch ? 'Dotknij, aby zejść na dół' : 'Zejście na dół' } : null;
      case 'obstacle':
        return flow.obstacleX !== null && dodgeDue(flow.obstacleX, flow.obstacleLane, player.x, player.currentFloor)
          ? { key: hopKey(player.currentFloor), line: touch ? 'Dotknij, aby ominąć' : 'Przeskocz przeszkodę' }
          : null;
      case 'apples':
        return { key: null, line: 'Zbieraj, nie przerywaj serii' };
      default:
        return null;
    }
  }

  private draw(now: number): void {
    const { keycap, arrow, caption, skipLabel } = this;
    if (!keycap || !caption || !skipLabel) return;
    const { scene, player } = this.deps;
    const { height } = scene.cameras.main;
    skipLabel.setPosition(SKIP_MARGIN_PX, SKIP_MARGIN_PX);

    const prompt = this.promptFor(now);
    const key = prompt?.key ?? '';
    // A new prompt starts the wait for its nudge from zero
    if (key !== this.shownKey || !prompt) {
      this.shownKey = key;
      this.shownAt = now;
    }
    const pulse = prompt?.key && isNudging(now - this.shownAt) ? 1.2 + 0.15 * Math.sin(scene.time.now / 130) : 1;

    const flash = this.flash && now < this.flash.until ? this.flash.text : null;
    const line = flash ?? prompt?.line ?? '';
    caption.setVisible(line !== '').setText(line).setColor(flash ? UI_TEXT.amber : UI_TEXT.bone);
    caption.setPosition(Math.round(player.x), Math.round(player.y - PROMPT_ABOVE_PX - CAPTION_ABOVE_PX));

    // A keyboard gets the key over the roach; a phone gets an arrow over the lane button it points at
    const showKey = !!prompt?.key && !flash;
    keycap.setVisible(showKey && !this.touch);
    if (showKey && !this.touch) {
      setArrow(keycap, key === '↑' ? 'up' : 'down');
      pulseArrow(keycap, pulse);
      keycap.setPosition(Math.round(player.x + keycapBob(scene.time.now)), Math.round(player.y - PROMPT_ABOVE_PX));
    }
    if (arrow) {
      arrow.setVisible(showKey);
      if (showKey) {
        const lane = laneButtonCentre(height);
        pulseArrow(arrow, pulse);
        arrow.setPosition(lane.x, Math.round(lane.y - lane.r - 40 + keycapBob(scene.time.now)));
      }
    }
  }
}
