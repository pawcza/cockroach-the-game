import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { MultiplayerOptions } from '../../server/multiplayer';

export interface Harness {
  url: string;
  connect: (headers?: Record<string, string>) => Promise<Socket>;
  stop: () => Promise<void>;
}

/** Runs the real server on a spare port with a throwaway database. */
export async function startServer(options?: MultiplayerOptions): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockroach-test-'));
  process.env.DB_PATH = path.join(dir, 'scores.db');
  const { createGameServer } = await import('../../server/app');
  const { server, close } = createGameServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  return {
    url,
    connect: (headers) => new Promise((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: headers });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    }),
    stop: async () => {
      for (const socket of sockets) socket.disconnect();
      await close();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function ack<T = Record<string, unknown>>(socket: Socket, event: string, ...args: unknown[]): Promise<T> {
  return socket.timeout(2000).emitWithAck(event, ...args);
}

export function next<T = Record<string, unknown>>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${event} within 2s`)), 2000);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Resolves once everything the server already received from this socket has been handled. */
export async function flush(socket: Socket): Promise<void> {
  await ack(socket, 'lobby:color', -1);
}

export async function inLobby(harness: Harness, count: number): Promise<Socket[]> {
  const sockets = await Promise.all(Array.from({ length: count }, (_, index) => harness.connect({
    'x-forwarded-for': `198.51.100.${index + 1}`,
  })));
  sockets.forEach((socket, index) => socket.emit('set-name', `P${index}`));
  const { lobby } = await ack<{ lobby: { id: string } }>(sockets[0], 'lobby:create');
  for (const socket of sockets.slice(1)) {
    await ack(socket, 'lobby:join', lobby.id);
    await ack(socket, 'lobby:ready', true);
  }
  return sockets;
}

export async function inGame(harness: Harness, count: number): Promise<Socket[]> {
  const sockets = await inLobby(harness, count);
  await ack(sockets[0], 'lobby:start');
  return sockets;
}
