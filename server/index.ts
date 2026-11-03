import { createGameServer } from './app';
import { authFromEnv } from './auth';

const PORT = process.env.PORT || 3456;
const SHUTDOWN_TIMEOUT_MS = 5000;

const auth = authFromEnv(process.env);
if (!auth) console.warn('Google sign-in is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, PUBLIC_URL): scores cannot be saved');
const { server, close } = createGameServer({ auth });

server.listen(PORT, () => {
  console.log(`Cockroach server running on port ${PORT}`);
});

let shuttingDown = false;

function shutDown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  void close().then(() => process.exit(0));
}

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
