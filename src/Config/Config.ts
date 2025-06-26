export interface Config {
  token: string;
  guildId: string;
  clientId: string;
  database: {
    url: string;
  };
}

export const config: Config = {
  token: process.env.DISCORD_TOKEN || "",
  guildId: process.env.GUILD_ID || "",
  clientId: process.env.CLIENT_ID || "",
  database: {
    url: process.env.DATABASE_URL || "sqlite:./bot.db",
  },
};
