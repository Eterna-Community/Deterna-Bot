import { Bootstrap } from "./Bootstrap";
import readline from "readline";
import type { IBoot } from "./Interfaces/IBoot";
import type { Logger } from "./Logger/Index";
import { LoggerFactory } from "./Logger/LoggerFactory";
import { LogTarget } from "./Logger/Types";

export let bootstrap: IBoot = new Bootstrap();
let logger: Logger = LoggerFactory.create("Main", [LogTarget.CONSOLE]);

async function main() {
  try {
    await bootstrap.onEnable();
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

// Make it input and Output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (input: string) => {
  const args = input.trim().split(" ");
  const command = args.shift()?.toLowerCase();

  if (command === "help") {
    logger.info("Read the docs u moron");
  } else if (command === "exit") {
    process.exit(0);
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  if (bootstrap) {
    await bootstrap.onDisable();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  if (bootstrap) {
    await bootstrap.onDisable();
  }
  process.exit(0);
});

if (require.main === module) {
  await main();
}
