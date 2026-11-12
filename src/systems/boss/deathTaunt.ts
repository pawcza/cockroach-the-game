/**
 * The boss that was waiting for you has a word on the game-over screen, if you died before reaching it: the first boss
 * on the ladder past the distance you got to. Not after a fight (that boss already had the last word), not in a match.
 */
import Phaser from 'phaser';
import { bossVoiceFor } from '../../audio/gibberish';
import { BossTaunt, TauntPlacement } from '../../ui/BossTaunt';
import { getTauntsEnabled } from '../../utils/Storage';
import { BossDef } from './bosses';
import { soloLadder } from './fights';
import { LinePicker } from './TauntDirector';

/** Right of the cat and the title, above the score, so nothing on the screen is covered. */
const GAME_OVER_PLACEMENT: TauntPlacement = { top: 100, centreClear: 150 };
/** After the screen has settled. */
const DELAY_MS = 1100;

/** The boss that mocks a run that ended `distance` metres in, from this cause, or null for none. */
export function bossForDeath(ladder: readonly BossDef[], distance: number, cause: string | null | undefined): BossDef | null {
  if (cause && (cause === 'boss' || ladder.some(b => b.id === cause))) return null;
  let next: BossDef | null = null;
  for (const boss of ladder) {
    if (boss.triggerDistance > distance && (!next || boss.triggerDistance < next.triggerDistance)) next = boss;
  }
  return next;
}

export function showDeathTaunt(scene: Phaser.Scene, distance: number | undefined, cause: string | null | undefined): void {
  if (distance === undefined || !getTauntsEnabled()) return;
  const boss = bossForDeath(soloLadder(), distance, cause);
  if (!boss) return;
  const widget = new BossTaunt(scene, bossVoiceFor(scene), GAME_OVER_PLACEMENT);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => widget.destroy());
  scene.time.delayedCall(DELAY_MS, () => widget.show(boss, new LinePicker().next(boss.id, 'gameOver')));
}
