import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LobbyManager, PLAYER_COLORS } from '../server/lobby';

function lobbyWith(...guests: string[]) {
  const manager = new LobbyManager();
  const lobby = manager.createLobby('host', 'Host');
  for (const guest of guests) manager.joinLobby(lobby.id, guest, guest);
  return { manager, lobby };
}

test('the creator hosts the lobby and is tracked in it', () => {
  const { manager, lobby } = lobbyWith();
  assert.equal(lobby.hostId, 'host');
  assert.equal(manager.getPlayerLobbyId('host'), lobby.id);
  assert.equal(manager.serializePlayers(lobby)[0]?.isHost, true);
});

test('joining an unknown lobby fails', () => {
  const manager = new LobbyManager();
  assert.equal(manager.joinLobby('NOPE', 'guest', 'Guest'), null);
});

test('players in one lobby get different colours', () => {
  const { manager, lobby } = lobbyWith('a', 'b', 'c');
  const colours = manager.serializePlayers(lobby).map((player) => player.color);
  assert.equal(new Set(colours).size, colours.length);
  assert.ok(colours.every((colour) => PLAYER_COLORS[colour] !== undefined));
});

test('the host leaving hands the lobby to someone else', () => {
  const { manager, lobby } = lobbyWith('guest');
  const result = manager.leaveLobby('host');
  assert.deepEqual(result, { lobbyId: lobby.id, disbanded: false });
  assert.equal(manager.getLobby(lobby.id)?.hostId, 'guest');
});

test('the last player leaving disbands the lobby', () => {
  const { manager, lobby } = lobbyWith();
  assert.equal(manager.leaveLobby('host')?.disbanded, true);
  assert.equal(manager.getLobby(lobby.id), null);
});

test('only the host can start the game', () => {
  const { manager, lobby } = lobbyWith('guest');
  manager.setReady('guest', true);
  assert.equal(manager.startGame('guest'), null);
  manager.setReady('host', true);
  assert.equal(manager.startGame('host')?.status, 'ingame');
  assert.equal(typeof manager.getLobby(lobby.id)?.seed, 'number');
});
