import { Bootstrap } from "./boot";
import type { IBoot } from "./interfaces/IBoot";

export const bootstrap: IBoot = new Bootstrap();

async function main() {
  try {
    await bootstrap.onEnable();
  } catch (error) {
    console.error("Fehler beim Bootstrap:", error);
  }
}

if (require.main === module) {
  await main();
}
