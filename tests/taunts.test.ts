import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSpeech, VOICES, type VoiceId } from '../src/audio/gibberish';
import { BOSSES } from '../src/systems/boss/bosses';
import { TAUNT_LINES, TAUNT_MAX_CHARS } from '../src/systems/boss/tauntLines';

const noJitter = (): number => 0.5;

test('every boss has a voice and at least eight short lines for every occasion', () => {
  for (const boss of BOSSES) {
    assert.ok(VOICES[boss.id as VoiceId], `${boss.id} has a voice`);
    for (const [category, lines] of Object.entries(TAUNT_LINES[boss.id])) {
      assert.ok(lines.length >= 8, `${boss.id}/${category} has ${lines.length} lines`);
      assert.equal(new Set(lines).size, lines.length, `${boss.id}/${category} repeats a line`);
      for (const line of lines) assert.ok(line.length <= TAUNT_MAX_CHARS, `${boss.id}/${category}: "${line}" is ${line.length} characters`);
    }
  }
});

test('a letter always takes the same vowel and nearly the same note', () => {
  const def = VOICES.lodzia;
  const a = planSpeech(def, 'ala ma kota', noJitter);
  const b = planSpeech(def, 'kota ala ma', noJitter);
  const find = (plan: typeof a, ch: string, text: string) => plan.syllables.find(s => text[s.index] === ch)!;
  const k1 = find(a, 'k', 'ala ma kota');
  const k2 = find(b, 'k', 'kota ala ma');
  assert.equal(k1.vowel, k2.vowel);
  // The pitch sags a little over a sentence, so a letter late in one is a little lower than at the start of another
  assert.ok(Math.abs(12 * Math.log2(k1.pitch / k2.pitch)) < 3);
});

test('spaces and punctuation carry no syllable, commas and full stops pause', () => {
  const plan = planSpeech(VOICES.bigos, 'aa, aa. aa', noJitter);
  assert.equal(plan.syllables.length, 6);
  assert.equal(plan.chars.length, 10);
  const [a1, a2, comma] = plan.chars;
  assert.equal(comma.voiced, false);
  const gapAfterComma = plan.chars[3].at - plan.chars[2].at;
  const gapBetweenLetters = a2.at - a1.at;
  assert.ok(gapAfterComma > gapBetweenLetters * 2);
});

test('a question lifts the last word and an exclamation makes it louder', () => {
  const q = planSpeech(VOICES.zlewiatan, 'nic nic?', noJitter).syllables;
  assert.ok(q[5].pitch > q[3].pitch * 1.1);
  const loud = planSpeech(VOICES.zlewiatan, 'nic nic!', noJitter).syllables;
  const plain = planSpeech(VOICES.zlewiatan, 'nic nic', noJitter).syllables;
  assert.ok(loud[5].gain > plain[5].gain);
});

test('the line is as long as its letters make it, and every character is timed in order', () => {
  for (const id of Object.keys(VOICES) as VoiceId[]) {
    const text = TAUNT_LINES[id].approach[0];
    const plan = planSpeech(VOICES[id], text, noJitter);
    assert.equal(plan.chars.length, Array.from(text).length);
    for (let i = 1; i < plan.chars.length; i++) assert.ok(plan.chars[i].at >= plan.chars[i - 1].at);
    assert.ok(plan.duration > 0.8 && plan.duration < 7, `${id}: ${plan.duration}s`);
  }
});

test('Bigos stays on its scale', () => {
  const def = VOICES.bigos;
  const plan = planSpeech(def, 'raz dwa trzy cztery', noJitter);
  for (const s of plan.syllables) {
    const semis = 12 * Math.log2(s.pitch / def.basePitch);
    assert.ok(def.scale!.some(n => Math.abs(n - semis) < 1.01), `${semis} is off the scale`);
  }
});
