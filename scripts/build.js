import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('dist');
if (output !== resolve(process.cwd(), 'dist')) throw new Error('Unexpected output path');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'src'])
  await cp(path, resolve(output, path), { recursive: true });
console.log('Built dist/ (zero runtime dependencies)');
