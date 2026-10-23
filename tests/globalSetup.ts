import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

export const WRANGLER = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");

declare module "vitest" {
  export interface ProvidedContext {
    persistDir: string;
  }
}

/** Creates an isolated local D1 and applies every migration exactly as production would. */
export default function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "wedding-test-"));
  execFileSync(process.execPath, [WRANGLER, "d1", "migrations", "apply", "wedding-db", "--local", "--persist-to", dir], {
    stdio: "pipe",
    env: { ...process.env, CI: "1" },
  });
  project.provide("persistDir", dir);

  return () => rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}
