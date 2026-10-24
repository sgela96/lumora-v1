import { createApp } from './app';
import { config } from './config';
import { getDb } from './db';

getDb();
createApp().listen(config.port, () => {
  console.log(`☀️  Lumora running on ${config.publicUrl}`);
  console.log(`   Dashboard: ${config.publicUrl}/app/`);
  console.log(`   Demo page: ${config.publicUrl}/demo/`);
});
