/**
 * Dev only: a run under any dev switch in the address leaves nothing in the profile: `?boss=` and `?checkpoints=` skip or
 * hand over what should have been earned, `?pill` hands over a pill, `?noskins` changes what the run looks like. Pure,
 * so the rule can be tested; Profile.ts asks it once with the real address.
 */
const DEV_SWITCHES = ['boss', 'checkpoints', 'pill', 'noskins'];

export function devRunFrom(search: string, dev: boolean): boolean {
  if (!dev) return false;
  const params = new URLSearchParams(search);
  return DEV_SWITCHES.some(name => params.has(name));
}
