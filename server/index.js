// Standalone browser-development entry point. Electron uses server/service.js
// directly so it can own the lifecycle and bind loopback only.
import { startNexusService } from './service.js';

const service = await startNexusService({
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  desktop: false,
});

const port = service.port;
console.log('');
console.log('  ⚔  NEXUS FORGE');
console.log(`  Local:   http://localhost:${port}`);
for (const ip of service.lanAddresses()) console.log(`  Network: http://${ip}:${port}`);
console.log(`  Admin:   http://localhost:${port}/#/admin`);
console.log(`  Token:   ${service.store.adminToken}`);
console.log(`  Cards:   ${service.store.cardDB.enabledCards().length}/${service.store.cardDB.collectible().length} enabled`);
console.log('');

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  try {
    await service.stop();
  } finally {
    if (signal) process.exit(0);
  }
}

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('uncaughtException', (err) => {
  console.error(err);
  shutdown('uncaughtException').finally(() => process.exit(1));
});
process.on('unhandledRejection', (err) => {
  console.error(err);
  shutdown('unhandledRejection').finally(() => process.exit(1));
});
