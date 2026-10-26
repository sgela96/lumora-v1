import { createApp } from './app';
import { config } from './config';
import { getDb } from './db';
import { startSyncLoop } from './sync';

getDb();
startSyncLoop();
createApp().listen(config.port, () => {
  console.log(`✨ Lumora running on ${config.publicUrl}`);
  console.log(`   Dashboard: ${config.publicUrl}/app/`);
  console.log(`   Demo page: ${config.publicUrl}/demo/`);
});
