import type { Client } from "discord.js";
import type { IEvent } from "../Interfaces/ICommand";
import { Glob } from "bun";
import {
  PerformanceMonitor,
  PerformanceMonitorWithStats,
} from "../Utils/Performance";

@PerformanceMonitor()
export class EventHandler {
  private client: Client;
  public events: IEvent[];

  constructor(client: Client) {
    this.client = client;
    this.events = [];
  }

  public async loadEvents(): Promise<void> {
    const glob = new Glob("*.{ts}");
    const eventFiles = await Array.fromAsync(
      glob.scan({
        cwd: "./src/Modules/Events",
      })
    );

    for (const file of eventFiles) {
      const event = await import(file);
      if (event.default) {
        this.events.push(event.default);
        this.registerEvent(event.default);
      }
    }
  }

  private registerEvent(event: IEvent): void {
    if (event.once) {
      this.client.once(event.name, (...args) => event.execute(...args));
    } else {
      this.client.on(event.name, (...args) => event.execute(...args));
    }
  }
}
