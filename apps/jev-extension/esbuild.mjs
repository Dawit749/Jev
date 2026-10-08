import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  absWorkingDir: directory,
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  alias: {
    "@jev/contracts": path.resolve(directory, "../../packages/contracts/src/index.ts"),
    "@jev/shared": path.resolve(directory, "../../packages/shared/src/index.ts"),
  },
});
