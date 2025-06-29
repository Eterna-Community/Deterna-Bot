import type { Client, ClientEvents } from "discord.js";
import { PerformanceMonitor } from "../utils/performance";
import { LoggerFactory } from "../logger/factory";
import type { IEvent } from "./types";
import type { Logger } from "../logger";
import { Glob } from "bun";
import path from "node:path";
import { pathToFileURL } from "node:url";

@PerformanceMonitor()
export class EventManager {
  private client: Client;
  public events: IEvent[];
  private logger: Logger = LoggerFactory.create("EventManager");

  constructor(client: Client) {
    this.client = client;
    this.events = [];
  }

  public async loadEvents(): Promise<void> {
    this.logger.info("Loading events from ./src/Modules/Events");

    const glob = new Glob("*.{ts,js}");
    const eventFiles = await Array.fromAsync(
      glob.scan({
        cwd: "./src/modules/events",
      })
    );

    this.logger.info(`Found ${eventFiles.length} event files`);

    for (const file of eventFiles) {
      try {
        const absolutePath = path.resolve("./src/modules/events", file);
        const fileUrl = pathToFileURL(absolutePath).href;
        const eventModule = await import(fileUrl);

        // Event-Klasse aus dem Modul extrahieren
        const EventClass =
          eventModule.default || eventModule[Object.keys(eventModule)[0]];

        if (EventClass && typeof EventClass === "function") {
          const eventInstance = new EventClass();

          // Prüfen ob es ein gültiges Event ist
          if (this.isValidEvent(eventInstance)) {
            this.events.push(eventInstance);
            this.registerEvent(eventInstance);
            this.logger.info(
              `Successfully loaded event: ${eventInstance.name}`
            );
          } else {
            this.logger.warn(`File ${file} does not export a valid event`);
          }
        } else {
          this.logger.warn(`File ${file} does not export a valid event class`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error loading event from ${file}:`, err);
      }
    }

    this.logger.info(`Loaded ${this.events.length} events successfully`);
  }

  private isValidEvent(obj: any): obj is IEvent {
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.name === "string" &&
      typeof obj.execute === "function" &&
      (obj.once === undefined || typeof obj.once === "boolean")
    );
  }

  private registerEvent<K extends keyof ClientEvents>(event: IEvent<K>): void {
    if (event.once) {
      this.client.once(event.name, async (...args) => {
        try {
          await event.execute(...(args as ClientEvents[K]));
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Error executing event ${event.name}:`, err);
        }
      });
    } else {
      this.client.on(event.name, async (...args) => {
        try {
          await event.execute(...(args as ClientEvents[K]));
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Error executing event ${event.name}:`, err);
        }
      });
    }
  }

  public getLoadedEvents(): IEvent[] {
    return [...this.events];
  }

  public getEventCount(): number {
    return this.events.length;
  }
}
