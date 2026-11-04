import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LobbyManager, PLAYER_COLORS } from '../server/lobby';

function lobbyWith(...guests: string[]) {
  const manager = new LobbyManager();
  const lobby = manager.createLobby('host', 'Host')!;
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

test('a player can only be in one lobby at a time', () => {
  const { manager, lobby } = lobbyWith('guest');
  assert.equal(manager.createLobby('guest', 'Guest'), null);
  const other = manager.createLobby('third', 'Third')!;
  assert.equal(manager.joinLobby(other.id, 'guest', 'Guest'), null);
  assert.equal(manager.joinLobby(lobby.id, 'guest', 'Guest'), null);
});

test('a running game cannot be started again or reseeded', () => {
  const { manager, lobby } = lobbyWith('guest');
  manager.setReady('guest', true);
  manager.startGame('host');
  const { seed } = lobby;
  assert.equal(manager.startGame('host'), null);
  assert.equal(lobby.seed, seed);
});

test('a rematch readies up and starts straight from the results', () => {
  const { manager, lobby } = lobbyWith('guest');
  manager.setReady('guest', true);
  manager.startGame('host');
  assert.ok(manager.serializePlayers(lobby).every((p) => p.place === 'game' && !p.ready));

  manager.endGame(lobby.id);
  assert.equal(lobby.status, 'waiting');
  assert.ok(manager.serializePlayers(lobby).every((p) => p.place === 'results' && !p.ready));
  assert.equal(manager.startGame('host'), null, 'not before the guest is ready again');
  manager.setReady('guest', true);
  assert.equal(manager.startGame('host')?.status, 'ingame');
});

test('between runs a player can go to the lobby screen and back, but not into a game', () => {
  const { manager, lobby } = lobbyWith('guest');
  manager.setReady('guest', true);
  manager.startGame('host');
  assert.equal(manager.setPlace('guest', 'lobby'), null, 'not during a run');
  manager.endGame(lobby.id);
  assert.equal(manager.setPlace('guest', 'lobby')?.players.get('guest')?.place, 'lobby');
  assert.equal(manager.setPlace('guest', 'game'), null);
  assert.equal(manager.setPlace('guest', 'results')?.players.get('guest')?.place, 'results');
});

test('someone joining during a run watches it, and after one waits in the lobby', () => {
  const { manager, lobby } = lobbyWith('guest');
  manager.setReady('guest', true);
  manager.startGame('host');
  assert.equal(manager.joinLobby(lobby.id, 'watcher', 'Watcher')?.players.get('watcher')?.place, 'watching');
  manager.endGame(lobby.id);
  assert.equal(lobby.players.get('watcher')?.place, 'results', 'and sees the results with everyone');
  assert.equal(manager.joinLobby(lobby.id, 'late', 'Late')?.players.get('late')?.place, 'lobby');
  assert.equal(lobby.players.get('host')?.place, 'results');
});

test('colour changes must be a real palette index', () => {
  const { manager } = lobbyWith();
  for (const bad of [NaN, -1, 1.5, PLAYER_COLORS.length]) assert.equal(manager.changeColor('host', bad), null);
  assert.ok(manager.changeColor('host', 3));
});
