import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
await mkdir('dist', { recursive: true });
await copyFile('src/index.html', 'dist/index.html');

const options = {
  entryPoints: ['src/main.tsx', 'src/styles.css'],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  outdir: 'dist',
  minify: !watch,
  sourcemap: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

if (watch) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
