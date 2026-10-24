import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/lumora.js',
  minify: !watch,
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: '/*! Lumora widget — https://lumora.app */' },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
