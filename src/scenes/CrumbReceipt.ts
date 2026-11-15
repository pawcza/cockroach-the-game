/**
 * The game over's okruszki receipt: where this run's okruszki came from, line by line, from the server's answer to the
 * run's report (RunTickets.ts), never from the client's own counts. The run's own line, each mission it finished
 * (struck through, with a tick), each achievement it reached, a total that counts up and the new balance. The lines
 * come one after another, quickly; skip() puts the whole receipt up at once. Nothing here holds anything else up.
 */
import Phaser from 'phaser';
import { playUi } from '../audio/AudioManager';
import { spaced } from '../../server/achievements';
import { createPanel } from '../ui/shared';
import { bodyStyle, smallStyle, UI_TEXT } from '../utils/TextStyles';
import type { RunResult } from '../systems/RunTickets';

/** Between one line and the next, and how long a line takes to come in. */
const LINE_MS = 220;
const ENTER_MS = 140;
/** A mission's strike, left to right. */
const STRIKE_MS = 260;
/** The total counting up. */
const COUNT_MS = 600;
const PAD = 12;
const ROW_GAP = 6;
/** A line of the receipt (16 px text and its gap), and the rule over the total. */
const ROW_H = 22;
const RULE_H = ROW_GAP + 4;
const CRUMB = '#e8c15a';
const STRUCK = '#9c8f7a';

export interface ReceiptArea {
  x: number;
  y: number;
  w: number;
  /** The receipt never reaches below this y. */
  bottom: number;
}

type Step = { at: number; run: () => void; finish: () => void };

export class CrumbReceipt {
  private readonly scene: Phaser.Scene;
  readonly area: ReceiptArea;
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** Every step of the receipt, and those not yet come in. */
  private steps: Step[] = [];
  private pending = new Set<Step>();
  private timers: Phaser.Time.TimerEvent[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private y = 0;
  /** Where the receipt's last line ends: the scene puts its button for the board or the sign-in under it. */
  private end = 0;

  constructor(scene: Phaser.Scene, area: ReceiptArea) {
    this.scene = scene;
    this.area = area;
  }

  /** Whether lines are still coming in. */
  get animating(): boolean {
    return this.pending.size > 0;
  }

  /** The y under the receipt's last line. */
  get bottom(): number {
    return this.end;
  }

  /** While the server is asked. */
  showPending(): void {
    this.clear();
    this.panel(this.area.y, 44);
    this.add(this.scene.add.text(this.area.x + PAD, this.area.y + 22, 'Liczę okruszki…', smallStyle({ color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0, 0.5));
    this.end = this.area.y + 44;
  }

  /**
   * The server's answer. A paid run gets the whole receipt; a guest's, the one line of what signing in would have
   * paid (`guestLine`); no answer, one line saying why there are no numbers. `note` adds a line under it (the board).
   */
  show(result: RunResult, opts: { guestLine?: (crumbs: number) => string; note?: string; why?: string } = {}): void {
    this.clear();
    const { x, w } = this.area;
    if (result.kind === 'none') { this.end = this.area.y; return; }
    if (result.kind !== 'checked') {
      const why = opts.why ?? (result.kind === 'offline' ? 'Brak połączenia: okruszki za ten bieg nie zostały policzone'
        : result.kind === 'outdated' ? 'Gra ma nową wersję: odśwież stronę, żeby liczyć okruszki'
          : result.kind === 'locked' ? 'Ten start nie jest odblokowany na koncie: bieg bez okruszków'
            : 'Serwer nie przyjął tego biegu: bez okruszków');
      this.single(why, '#e07a6a', opts.note);
      return;
    }
    const { receipt } = result;
    if (!receipt.counted) {
      this.single(`Za krótki bieg (${spaced(receipt.score)} pkt): bez okruszków`, UI_TEXT.muted, opts.note);
      return;
    }
    if (!receipt.paid) {
      this.single(opts.guestLine?.(receipt.crumbs) ?? `Zaloguj się, żeby dostać ${receipt.crumbs} okr.`, UI_TEXT.bone, opts.note);
      return;
    }

    // Laid out first (hidden), so the panel is the receipt's size from the start; then shown line by line. What doesn't
    // fit the room it has gives way in this order: the balance joins the total's line, the heading goes, and the last
    // missions and achievements are summed into one line
    const top = this.area.y;
    const items = [
      ...receipt.missions.map(m => ({ label: m.text, reward: m.reward, color: UI_TEXT.bone, strike: true })),
      ...receipt.achievements.map(a => ({ label: a.name, reward: a.reward, color: '#ffe066', strike: false })),
    ];
    const noteRows = opts.note ? 1 : 0;
    const roomRows = Math.floor((this.area.bottom - top - PAD * 2 - RULE_H) / ROW_H);
    const withBalance = receipt.balance !== null;
    const fullRows = 1 + 1 + items.length + 1 + (withBalance ? 1 : 0) + noteRows;
    const ownBalanceLine = withBalance && fullRows <= roomRows;
    const heading = fullRows - (withBalance && !ownBalanceLine ? 1 : 0) <= roomRows || roomRows >= 7;
    const itemRows = Math.max(1, roomRows - (heading ? 1 : 0) - 1 - 1 - (ownBalanceLine ? 1 : 0) - noteRows);

    this.y = top + PAD;
    if (heading) {
      const header = this.add(this.scene.add.text(x + PAD, this.y, 'OKRUSZKI', bodyStyle({ color: CRUMB, strokeThickness: 0 })));
      this.y += header.height + ROW_GAP;
    }
    let at = 0;
    const next = (): number => (at += LINE_MS);
    this.row(`Bieg: ${spaced(receipt.score)} pkt`, receipt.crumbs, UI_TEXT.bone, next());
    const shown = items.length > itemRows ? items.slice(0, itemRows - 1) : items;
    for (const item of shown) this.row(item.label, item.reward, item.color, next(), item.strike);
    const rest = items.slice(shown.length);
    if (rest.length > 0) this.row(`i ${rest.length} więcej`, rest.reduce((sum, item) => sum + item.reward, 0), UI_TEXT.bone, next());

    // The total, counting up, and the balance
    const ruleY = this.y + 2;
    const rule = this.add(this.scene.add.rectangle(x + PAD, ruleY, w - PAD * 2, 2, 0x8a7d6b, 0.6).setOrigin(0, 0)) as Phaser.GameObjects.Rectangle;
    this.y += RULE_H;
    const totalAt = next();
    const balanceText = receipt.balance !== null ? `Masz teraz ${spaced(receipt.balance)} okr.` : '';
    const totalLabel = this.add(this.scene.add.text(x + PAD, this.y, withBalance && !ownBalanceLine ? `Razem · ${balanceText.toLowerCase()}` : 'Razem',
      smallStyle({ color: UI_TEXT.bone, strokeThickness: 0 })));
    const totalValue = this.add(this.scene.add.text(x + w - PAD, this.y, '+0', smallStyle({ color: CRUMB, strokeThickness: 0 })).setOrigin(1, 0)) as Phaser.GameObjects.Text;
    this.y += totalLabel.height + ROW_GAP;
    const balance = ownBalanceLine
      ? this.add(this.scene.add.text(x + PAD, this.y, balanceText, smallStyle({ color: UI_TEXT.muted, strokeThickness: 0 })))
      : null;
    if (balance) this.y += balance.height + ROW_GAP;
    if (opts.note) this.noteLine(opts.note);
    this.end = this.y + PAD - ROW_GAP;
    this.panel(top, this.end - top);

    for (const o of [rule, totalLabel, totalValue, ...(balance ? [balance] : [])]) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
    const counter = { value: 0 };
    this.step(totalAt, () => {
      this.fadeIn([rule, totalLabel, totalValue]);
      this.tweens.push(this.scene.tweens.add({
        targets: counter, value: receipt.total, duration: COUNT_MS, ease: 'Cubic.easeOut',
        onUpdate: () => totalValue.setText(`+${spaced(Math.round(counter.value))}`),
        onComplete: () => playUi(this.scene, 'ui-purchase'),
      }));
    }, () => {
      (rule as Phaser.GameObjects.Rectangle).setAlpha(1);
      totalLabel.setAlpha(1);
      totalValue.setAlpha(1).setText(`+${spaced(receipt.total)}`);
    });
    if (balance) this.step(totalAt + COUNT_MS, () => this.fadeIn([balance]), () => balance.setAlpha(1));
    this.play();
  }

  /** Every line up at once, every number at its end. */
  skip(): void {
    for (const timer of this.timers) timer.remove(false);
    for (const tween of this.tweens) tween.stop();
    for (const step of this.steps) step.finish();
    this.timers = [];
    this.tweens = [];
    this.pending.clear();
  }

  destroy(): void {
    this.clear();
  }

  // ── Building it ───────────────────────────────────────────────────────

  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private panel(y: number, h: number): Phaser.GameObjects.Graphics {
    const panel = createPanel(this.scene, this.area.x, y, this.area.w, h);
    // Behind the lines, which were made before it
    if (this.objects.length > 0) this.scene.children.moveBelow(panel, this.objects[0]);
    this.objects.push(panel);
    return panel;
  }

  /** One line of text in its own panel: a guest's, or why there are no numbers. */
  private single(text: string, color: string, note?: string): void {
    const top = this.area.y;
    this.y = top + PAD;
    const line = this.add(this.scene.add.text(this.area.x + PAD, this.y, text, smallStyle({
      color, strokeThickness: 0, wordWrap: { width: this.area.w - PAD * 2 }, lineSpacing: 4,
    })));
    this.y += line.height + ROW_GAP;
    if (note) this.noteLine(note);
    this.end = this.y + PAD - ROW_GAP;
    this.panel(top, this.end - top);
  }

  private noteLine(note: string): void {
    const line = this.add(this.scene.add.text(this.area.x + PAD, this.y, note, smallStyle({
      color: UI_TEXT.named, strokeThickness: 0, wordWrap: { width: this.area.w - PAD * 2 },
    })));
    this.y += line.height + ROW_GAP;
  }

  /** A line: what it is on the left, its okruszki on the right; a mission's gets struck through as it comes in. */
  private row(label: string, reward: number, color: string, at: number, strike = false): void {
    const { x, w } = this.area;
    const value = this.add(this.scene.add.text(x + w - PAD, this.y, `+${spaced(reward)}`, smallStyle({ color: CRUMB, strokeThickness: 0 })).setOrigin(1, 0));
    const text = this.add(this.scene.add.text(x + PAD, this.y, label, smallStyle({
      color, strokeThickness: 0, wordWrap: { width: w - PAD * 3 - value.width }, lineSpacing: 2,
    })));
    const rowH = Math.max(text.height, value.height);
    // The strike runs through the middle of each line of the text
    const lines = text.getWrappedText(label).length;
    const lineH = text.height / Math.max(1, lines);
    const strikes = strike ? Array.from({ length: lines }, (_, i) => {
      const width = measure(text, text.getWrappedText(label)[i]);
      return this.add(this.scene.add.rectangle(x + PAD - 2, this.y + lineH * i + lineH * 0.55, width + 4, 2, 0xe8c15a).setOrigin(0, 0.5).setScale(0, 1));
    }) : [];
    this.y += rowH + ROW_GAP;
    text.setAlpha(0);
    value.setAlpha(0);
    const shift = (o: Phaser.GameObjects.Text): void => { o.x += 8; };
    shift(text);
    this.step(at, () => {
      this.fadeIn([text], true);
      if (!strike) { this.fadeIn([value]); return; }
      strikes.forEach((bar, i) => this.tweens.push(this.scene.tweens.add({
        targets: bar, scaleX: 1, duration: STRIKE_MS / strikes.length, delay: ENTER_MS + (i * STRIKE_MS) / strikes.length,
        onStart: () => { if (i === 0) playUi(this.scene, 'ui-slider'); },
        onComplete: () => {
          if (i < strikes.length - 1) return;
          text.setColor(STRUCK);
          this.fadeIn([value]);
        },
      })));
    }, () => {
      text.setAlpha(1).setX(x + PAD);
      value.setAlpha(1);
      for (const bar of strikes) (bar as Phaser.GameObjects.Rectangle).setScale(1, 1);
      if (strike) text.setColor(STRUCK);
    });
  }

  private fadeIn(objects: Phaser.GameObjects.GameObject[], slide = false): void {
    for (const o of objects) {
      const target = o as Phaser.GameObjects.Text;
      this.tweens.push(this.scene.tweens.add({
        targets: target, alpha: 1, duration: ENTER_MS, ...(slide ? { x: target.x - 8 } : {}),
      }));
    }
  }

  private step(at: number, run: () => void, finish: () => void): void {
    this.steps.push({ at, run, finish });
  }

  private play(): void {
    for (const step of this.steps) {
      this.pending.add(step);
      this.timers.push(this.scene.time.delayedCall(step.at, step.run));
    }
    // It counts as coming in until the last line is fully in, its tweens included
    const last = Math.max(...this.steps.map(s => s.at)) + COUNT_MS + STRIKE_MS + ENTER_MS;
    this.timers.push(this.scene.time.delayedCall(last, () => this.pending.clear()));
  }

  private clear(): void {
    this.skip();
    this.steps = [];
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}

/** The width one line of a text takes, in its own style. */
function measure(text: Phaser.GameObjects.Text, line: string): number {
  const ctx = text.canvas.getContext('2d');
  if (!ctx) return text.width;
  ctx.save();
  ctx.font = `${text.style.fontSize} ${text.style.fontFamily}`;
  const width = ctx.measureText(line).width;
  ctx.restore();
  return width;
}
