import * as esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
// Runtime dependencies stay in node_modules; workspace packages (@lumora/*) are bundled.
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@lumora/'));

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/index.js',
  sourcemap: true,
  external: [...external, ...external.map((name) => `${name}/*`)],
  logLevel: 'info',
});
