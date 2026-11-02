import { createGameServer } from './app';

const PORT = process.env.PORT || 3456;
const SHUTDOWN_TIMEOUT_MS = 5000;

const { server, close } = createGameServer();

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
