import type { Client } from "discord.js";
import type { IEvent } from "../Interfaces/ICommand";

export class EventHandler {
  private client: Client;
  public events: IEvent[];

  constructor(client: Client) {
    this.client = client;
    this.events = [];
  }

  public async loadEvents(): Promise<void> {
    /*
    const eventFiles = glob.sync('./src/Modules/Events/*.ts');
    for (const file of eventFiles) {
      const event = await import(file);
      if (event.default) {
        this.events.push(event.default);
        this.registerEvent(event.default);
      }
    }
    */
  }

  private registerEvent(event: IEvent): void {
    if (event.once) {
      this.client.once(event.name, (...args) => event.execute(...args));
    } else {
      this.client.on(event.name, (...args) => event.execute(...args));
    }
  }
}
