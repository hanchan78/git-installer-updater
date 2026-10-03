import { build } from 'esbuild';
await build({entryPoints:['src/main.ts'],bundle:true,external:['obsidian'],format:'cjs',platform:'browser',target:'es2020',outfile:'main.js',banner:{js:'/* Built plugin. Commit this file together with manifest.json and styles.css. */'}});
