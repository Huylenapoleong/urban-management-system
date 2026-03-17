import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

let hasLoaded = false;

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n');
  }

  return trimmed;
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const normalizedLine = trimmedLine.startsWith('export ')
      ? trimmedLine.slice('export '.length)
      : trimmedLine;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = normalizedLine.slice(separatorIndex + 1);
    process.env[key] = parseEnvValue(value);
  }
}

function collectSearchDirs(startDir: string): string[] {
  const dirs: string[] = [];
  let currentDir = resolve(startDir);

  while (true) {
    dirs.push(currentDir);
    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return dirs;
}

function getEnvSearchDirs(): string[] {
  const dirs = new Set<string>([
    resolve(process.cwd(), 'apps/api'),
    resolve(__dirname, '../../../..'),
    resolve(__dirname, '../../..'),
    process.cwd(),
  ]);
  const orderedDirs: string[] = [];

  for (const baseDir of dirs) {
    for (const dir of collectSearchDirs(baseDir)) {
      if (!orderedDirs.includes(dir)) {
        orderedDirs.push(dir);
      }
    }
  }

  return orderedDirs;
}

export function loadEnvFiles(): void {
  if (hasLoaded) {
    return;
  }

  for (const dir of getEnvSearchDirs()) {
    loadEnvFile(join(dir, '.env'));
    loadEnvFile(join(dir, '.env.local'));
  }

  hasLoaded = true;
}
