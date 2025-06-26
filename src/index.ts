import { Bootstrap } from "./Bootstrap";
import type { IBoot } from "./Interfaces/IBoot";

let bootstrap: IBoot;

async function main() {
  try {
    bootstrap = new Bootstrap();
    await bootstrap.onEnable();
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  if (bootstrap) {
    await bootstrap.onDisable();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  if (bootstrap) {
    await bootstrap.onDisable();
  }
  process.exit(0);
});

if (require.main === module) {
  await main();
}
