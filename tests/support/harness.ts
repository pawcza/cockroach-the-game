import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { GameServerOptions } from '../../server/app';

export interface Harness {
  url: string;
  /** Signs in as this Google account through the real callback and returns the session cookie. */
  signIn: (googleSub: string, name?: string) => Promise<string>;
  connect: (headers?: Record<string, string>) => Promise<Socket>;
  stop: () => Promise<void>;
}

/** Runs the real server on a spare port with a throwaway database. */
/** A stand-in for Google: the authorization code is the account id, with an optional name after a colon. */
export const TEST_AUTH = {
  clientId: 'test-client',
  clientSecret: 'test-secret',
  sessionSecret: 'test-session-secret',
  publicUrl: 'http://127.0.0.1',
  exchangeCode: async (code: string) => {
    const [sub, name] = code.split(':');
    return { sub, name: name ?? null };
  },
};

export function cookiesOf(res: Response): string {
  return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

export async function startServer(options: GameServerOptions = { auth: TEST_AUTH }): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockroach-test-'));
  process.env.DB_PATH = path.join(dir, 'scores.db');
  const { createGameServer } = await import('../../server/app');
  const { server, close } = createGameServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  return {
    url,
    signIn: async (googleSub, name) => {
      const start = await fetch(`${url}/api/auth/google`, { redirect: 'manual' });
      const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
      const code = encodeURIComponent(name ? `${googleSub}:${name}` : googleSub);
      const back = await fetch(`${url}/api/auth/google/callback?code=${code}&state=${state}`, {
        redirect: 'manual',
        headers: { cookie: cookiesOf(start) },
      });
      return cookiesOf(back).split('; ').find(c => c.startsWith('kc_session=')) ?? '';
    },
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
