import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
await build({entryPoints:['tests/runner.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.test-output/tests.cjs',alias:{obsidian:resolve('tests/obsidian-stub.ts')}});
const r=spawnSync(process.execPath,['--test','.test-output/tests.cjs'],{stdio:'inherit'});
process.exitCode=r.status??1;
