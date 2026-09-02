import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isProjectPage = Boolean(
  repositoryName && !repositoryName.endsWith('.github.io'),
);

if (process.env.GITHUB_ACTIONS === 'true' && isProjectPage) {
  const outputDirectory = join(process.cwd(), 'dist', 'client');
  const prefix = `/${repositoryName}/_next/`;
  const textExtensions = new Set(['.html', '.rsc', '.js', '.css', '.json']);

  for (const path of await walk(outputDirectory)) {
    if (!textExtensions.has(extname(path))) continue;
    const original = await readFile(path, 'utf8');
    const updated = original.replaceAll('/_next/', prefix);
    if (updated !== original) await writeFile(path, updated);
  }
}

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(path)));
    else paths.push(path);
  }
  return paths;
}
