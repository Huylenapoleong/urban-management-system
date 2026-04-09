import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const pnpmDir = resolve(process.cwd(), "node_modules/.pnpm");
const stub =
  '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n';
let patchedCount = 0;
let repairedWsFileCount = 0;

function patchDirectory(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    if (entry === "node_modules") {
      continue;
    }

    const entryPath = join(dirPath, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      patchDirectory(entryPath);
      continue;
    }

    if (!entry.endsWith(".d.ts") || entry === "index.d.ts") {
      continue;
    }

    const jsPath = entryPath.replace(/\.d\.ts$/, ".js");

    if (existsSync(jsPath)) {
      continue;
    }

    writeFileSync(jsPath, stub, "utf8");
    patchedCount += 1;
  }
}

function patchNestPackages() {
  if (!existsSync(pnpmDir)) {
    return;
  }

  for (const packageDir of readdirSync(pnpmDir)) {
    const nestScopeDir = join(pnpmDir, packageDir, "node_modules", "@nestjs");

    if (!existsSync(nestScopeDir)) {
      continue;
    }

    for (const nestPackage of readdirSync(nestScopeDir)) {
      const nestPackageDir = join(nestScopeDir, nestPackage);

      if (!existsSync(nestPackageDir)) {
        continue;
      }

      patchDirectory(nestPackageDir);
    }
  }
}

function getWsDirs() {
  const results = [];

  if (!existsSync(pnpmDir)) {
    return results;
  }

  for (const packageDir of readdirSync(pnpmDir)) {
    const directWsDir = join(pnpmDir, packageDir, "node_modules", "ws");

    if (existsSync(directWsDir)) {
      results.push(directWsDir);
    }

    const nestScopeDir = join(pnpmDir, packageDir, "node_modules");
    if (!existsSync(nestScopeDir)) {
      continue;
    }

    const nestedWsDir = join(nestScopeDir, "ws");
    if (existsSync(nestedWsDir) && !results.includes(nestedWsDir)) {
      results.push(nestedWsDir);
    }
  }

  const rootWsDir = resolve(process.cwd(), "node_modules/ws");
  if (existsSync(rootWsDir) && !results.includes(rootWsDir)) {
    results.push(rootWsDir);
  }

  return results;
}

const REQUIRED_WS_FILES = [
  "browser.js",
  "index.js",
  "wrapper.mjs",
  "lib/buffer-util.js",
  "lib/constants.js",
  "lib/event-target.js",
  "lib/extension.js",
  "lib/limiter.js",
  "lib/permessage-deflate.js",
  "lib/receiver.js",
  "lib/sender.js",
  "lib/stream.js",
  "lib/subprotocol.js",
  "lib/validation.js",
  "lib/websocket-server.js",
  "lib/websocket.js",
];

function isCompleteWsDir(dirPath) {
  return REQUIRED_WS_FILES.every((relativePath) =>
    existsSync(join(dirPath, relativePath)),
  );
}

function repairWsPackages() {
  const wsDirs = getWsDirs();
  const donorDir = [...wsDirs]
    .sort()
    .reverse()
    .find((dirPath) => isCompleteWsDir(dirPath));

  if (!donorDir) {
    return;
  }

  for (const wsDir of wsDirs) {
    for (const relativePath of REQUIRED_WS_FILES) {
      const targetPath = join(wsDir, relativePath);

      if (existsSync(targetPath)) {
        continue;
      }

      const sourcePath = join(donorDir, relativePath);
      if (!existsSync(sourcePath)) {
        continue;
      }

      mkdirSync(resolve(targetPath, ".."), { recursive: true });
      copyFileSync(sourcePath, targetPath);
      repairedWsFileCount += 1;
    }
  }
}

patchNestPackages();
repairWsPackages();

if (patchedCount > 0) {
  console.log(
    `[patch-runtime-deps] created ${patchedCount} Nest runtime stub files.`,
  );
}

if (repairedWsFileCount > 0) {
  console.log(
    `[patch-runtime-deps] repaired ${repairedWsFileCount} missing ws runtime files.`,
  );
}
