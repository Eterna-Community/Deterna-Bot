import type { ClientEvents } from "discord.js";

export interface IEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void>;
}

export abstract class BaseEvent<K extends keyof ClientEvents>
  implements IEvent<K>
{
  public abstract readonly name: K;
  public once?: boolean = false;

  public abstract execute(...args: ClientEvents[K]): Promise<void>;
}
