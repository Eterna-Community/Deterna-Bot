import { CommandBuilder } from "./CommandBuilder";
import type { BaseCommand, CommandConfig } from "./types";

export function Command(config: CommandConfig) {
  return function <T extends new (...args: any[]) => BaseCommand>(
    constructor: T
  ) {
    ///@ts-expect-error // Fuck this shit, TS
    const DecoratedClass = class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        this.data = CommandBuilder.build(config);
      }
    };
    Object.defineProperty(DecoratedClass, "name", { value: constructor.name });

    return DecoratedClass as T;
  };
}
