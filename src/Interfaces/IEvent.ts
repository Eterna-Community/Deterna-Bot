import type { ClientEvents } from "discord.js";

// Interface für Events mit generischem Typ
export interface IEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void>;
}

// Abstrakte Basisklasse mit generischem Typ
export abstract class BaseEvent<K extends keyof ClientEvents>
  implements IEvent<K>
{
  public abstract readonly name: K;
  public once?: boolean = false;

  public abstract execute(...args: ClientEvents[K]): Promise<void>;
}

// Beispiel-Implementation für ein spezifisches Event
export class MessageCreateEvent extends BaseEvent<"messageCreate"> {
  public readonly name = "messageCreate";
  public once = false;

  public async execute(
    message: ClientEvents["messageCreate"][0]
  ): Promise<void> {
    // Hier ist der Parameter typsicher als Message
    console.log(`Nachricht erhalten: ${message.content}`);
  }
}

// Beispiel für ein einmaliges Event
export class ReadyEvent extends BaseEvent<"ready"> {
  public readonly name = "ready";
  public once = true;

  public async execute(client: ClientEvents["ready"][0]): Promise<void> {
    console.log(`Bot ist bereit! Eingeloggt als ${client.user.tag}`);
  }
}
