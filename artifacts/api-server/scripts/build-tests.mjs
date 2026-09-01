import { build } from "esbuild";
import { cpSync, existsSync, globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const entryPoints = globSync("src/**/*.test.ts", { cwd: artifactDir }).map((file) =>
  path.join(artifactDir, file),
);

if (entryPoints.length === 0) {
  console.log("No *.test.ts files found.");
  process.exit(0);
}

await build({
  entryPoints,
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.join(artifactDir, "dist-test"),
  outExtension: { ".js": ".mjs" },
  outbase: path.join(artifactDir, "src"),
  logLevel: "info",
  external: ["pg-native"],
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; globalThis.require = __cr(import.meta.url);`,
  },
});

// esbuild only bundles code; copy non-JS test fixtures (e.g. JSON) next to
// their compiled test file so tests can read them at their original
// relative path.
for (const fixturesDir of globSync("src/**/fixtures", { cwd: artifactDir })) {
  const src = path.join(artifactDir, fixturesDir);
  const dest = path.join(artifactDir, "dist-test", path.relative("src", fixturesDir));
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}
