import { startJevServer } from "./app.js";
import { loadConfig, loadRepoEnv, publicConfig } from "./config.js";
import { createSafeLogger } from "./log.js";
import { createStack } from "./stack.js";

async function main(): Promise<void> {
  const envLoaded = loadRepoEnv();
  const config = loadConfig();
  const log = createSafeLogger();
  const running = await startJevServer({
    host: config.host,
    port: config.port,
    stack: createStack(config),
    log,
  });
  log("server.listening", { ...publicConfig(config), envLoaded });
  const shutdown = () => {
    void running.close().then(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith("JEV_")) {
    console.error(error.message);
  } else {
    console.error(
      JSON.stringify({
        event: "server.failed",
        name: error instanceof Error ? error.name : "Error",
      }),
    );
  }
  process.exitCode = 1;
});
