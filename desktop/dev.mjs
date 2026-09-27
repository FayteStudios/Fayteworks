import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const server = await createServer({ server: { port: 5199 } });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Editor dev server: ${url}`);

const env = { ...process.env, FAYTEWORKS_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(require("electron"), ["."], { stdio: "inherit", env });
electron.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
