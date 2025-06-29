import type { Client, TextChannel, EmbedBuilder } from "discord.js";
import { createHash, createHmac } from "crypto";
import type { Server } from "bun";
import type { ServiceConfig } from "../types";
import { BaseService } from "..";
import type { Logger } from "../../logger";
import { LoggerFactory } from "../../logger/factory";
import { PerformanceMonitor } from "../../utils/performance";

export interface GitHubWebhookConfig extends ServiceConfig {
  port: number;
  webhookSecret: string;
  channelId: string;
  allowedEvents: string[];
}
@PerformanceMonitor()
export class GitHubWebhookService extends BaseService {
  public readonly identifier = "GitHubWebhookService";
  public config: GitHubWebhookConfig;
  public logger: Logger;

  private server: Server | null = null;
  private client: Client;

  constructor(client: Client, config: GitHubWebhookConfig) {
    super();
    this.client = client;
    this.config = config;
    this.logger = LoggerFactory.create(this.identifier);
  }

  protected async onServiceEnable(): Promise<void> {
    this.server = Bun.serve({
      port: this.config.port,
      fetch: this.handleRequest.bind(this),
    });

    this.logger.info(
      `GitHub Webhook server listening on port ${this.config.port}`
    );
  }

  protected async onServiceDisable(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.logger.info("GitHub Webhook server stopped");
  }

  protected async onHealthCheck(): Promise<boolean> {
    return this.server !== null;
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");

    if (!signature || !event || !delivery) {
      return new Response("Missing required headers", { status: 400 });
    }

    const body = await request.text();

    // Verify webhook signature
    if (!this.verifySignature(body, signature)) {
      this.logger.warn("Invalid webhook signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Check if event is allowed
    if (!this.config.allowedEvents.includes(event)) {
      return new Response("Event not configured", { status: 200 });
    }

    try {
      const payload = JSON.parse(body);
      await this.handleGitHubEvent(event, payload);
      return new Response("OK", { status: 200 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error processing webhook:", err);
      return new Response("Internal server error", { status: 500 });
    }
  }

  private verifySignature(body: string, signature: string): boolean {
    const expectedSignature = createHmac("sha256", this.config.webhookSecret)
      .update(body)
      .digest("hex");

    const actualSignature = signature.replace("sha256=", "");
    return (
      createHash("sha256").update(expectedSignature).digest("hex") ===
      createHash("sha256").update(actualSignature).digest("hex")
    );
  }

  private async handleGitHubEvent(event: string, payload: any): Promise<void> {
    const channel = this.client.channels.cache.get(
      this.config.channelId
    ) as TextChannel;

    if (!channel) {
      this.logger.error(`Channel ${this.config.channelId} not found`);
      return;
    }

    const embed = this.createEmbedForEvent(event, payload);
    if (embed) {
      await channel.send({ embeds: [embed] });
    }
  }

  private createEmbedForEvent(
    event: string,
    payload: any
  ): EmbedBuilder | null {
    const { EmbedBuilder } = require("discord.js");

    switch (event) {
      case "push":
        return this.createPushEmbed(payload);
      case "pull_request":
        return this.createPullRequestEmbed(payload);
      case "issues":
        return this.createIssueEmbed(payload);
      case "release":
        return this.createReleaseEmbed(payload);
      case "star":
        return this.createStarEmbed(payload);
      default:
        this.logger.warn(`Unhandled event type: ${event}`);
        return null;
    }
  }

  private createPushEmbed(payload: any): EmbedBuilder {
    const { EmbedBuilder } = require("discord.js");
    const branch = payload.ref.replace("refs/heads/", "");
    const commits = payload.commits.slice(0, 5); // Limit to 5 commits

    const embed = new EmbedBuilder()
      .setTitle("📦 New Push")
      .setDescription(
        `**${payload.pusher.name}** pushed ${payload.commits.length} commit(s) to \`${branch}\``
      )
      .setColor(0x28a745)
      .setURL(payload.compare)
      .setAuthor({
        name: payload.repository.full_name,
        iconURL: payload.repository.owner.avatar_url,
        url: payload.repository.html_url,
      })
      .setTimestamp(new Date(payload.head_commit.timestamp));

    if (commits.length > 0) {
      const commitText = commits
        .map(
          (commit: any) =>
            `[\`${commit.id.substring(0, 7)}\`](${commit.url}) ${
              commit.message.split("\n")[0]
            }`
        )
        .join("\n");

      embed.addFields({
        name: "Commits",
        value: commitText,
        inline: false,
      });
    }

    return embed;
  }

  private createPullRequestEmbed(payload: any): EmbedBuilder {
    const { EmbedBuilder } = require("discord.js");
    const pr = payload.pull_request;
    const action = payload.action;

    let color = 0x6f42c1;
    let emoji = "🔄";

    switch (action) {
      case "opened":
        color = 0x28a745;
        emoji = "🆕";
        break;
      case "closed":
        color = pr.merged ? 0x6f42c1 : 0xdc3545;
        emoji = pr.merged ? "✅" : "❌";
        break;
      case "reopened":
        color = 0x28a745;
        emoji = "🔄";
        break;
    }

    return new EmbedBuilder()
      .setTitle(`${emoji} Pull Request ${action}`)
      .setDescription(
        `**${pr.title}**\n\n${pr.body?.substring(0, 200) || "No description"}${
          pr.body?.length > 200 ? "..." : ""
        }`
      )
      .setColor(color)
      .setURL(pr.html_url)
      .setAuthor({
        name: payload.repository.full_name,
        iconURL: payload.repository.owner.avatar_url,
        url: payload.repository.html_url,
      })
      .addFields(
        { name: "Author", value: pr.user.login, inline: true },
        { name: "Base", value: pr.base.ref, inline: true },
        { name: "Head", value: pr.head.ref, inline: true }
      )
      .setTimestamp(new Date(pr.created_at));
  }

  private createIssueEmbed(payload: any): EmbedBuilder {
    const { EmbedBuilder } = require("discord.js");
    const issue = payload.issue;
    const action = payload.action;

    let color = 0xffc107;
    let emoji = "🐛";

    switch (action) {
      case "opened":
        color = 0x28a745;
        emoji = "🆕";
        break;
      case "closed":
        color = 0x6f42c1;
        emoji = "✅";
        break;
      case "reopened":
        color = 0x28a745;
        emoji = "🔄";
        break;
    }

    return new EmbedBuilder()
      .setTitle(`${emoji} Issue ${action}`)
      .setDescription(
        `**${issue.title}**\n\n${
          issue.body?.substring(0, 200) || "No description"
        }${issue.body?.length > 200 ? "..." : ""}`
      )
      .setColor(color)
      .setURL(issue.html_url)
      .setAuthor({
        name: payload.repository.full_name,
        iconURL: payload.repository.owner.avatar_url,
        url: payload.repository.html_url,
      })
      .addFields(
        { name: "Author", value: issue.user.login, inline: true },
        {
          name: "Labels",
          value: issue.labels.map((l: any) => l.name).join(", ") || "None",
          inline: true,
        }
      )
      .setTimestamp(new Date(issue.created_at));
  }

  private createReleaseEmbed(payload: any): EmbedBuilder {
    const { EmbedBuilder } = require("discord.js");
    const release = payload.release;

    return new EmbedBuilder()
      .setTitle("🚀 New Release")
      .setDescription(
        `**${release.name || release.tag_name}**\n\n${
          release.body?.substring(0, 300) || "No release notes"
        }${release.body?.length > 300 ? "..." : ""}`
      )
      .setColor(0x28a745)
      .setURL(release.html_url)
      .setAuthor({
        name: payload.repository.full_name,
        iconURL: payload.repository.owner.avatar_url,
        url: payload.repository.html_url,
      })
      .addFields(
        { name: "Tag", value: release.tag_name, inline: true },
        { name: "Author", value: release.author.login, inline: true },
        {
          name: "Prerelease",
          value: release.prerelease ? "Yes" : "No",
          inline: true,
        }
      )
      .setTimestamp(new Date(release.published_at));
  }

  private createStarEmbed(payload: any): EmbedBuilder {
    const { EmbedBuilder } = require("discord.js");

    return new EmbedBuilder()
      .setTitle("⭐ Repository Starred")
      .setDescription(`**${payload.sender.login}** starred the repository`)
      .setColor(0xffc107)
      .setURL(payload.repository.html_url)
      .setAuthor({
        name: payload.repository.full_name,
        iconURL: payload.repository.owner.avatar_url,
        url: payload.repository.html_url,
      })
      .addFields({
        name: "Total Stars",
        value: payload.repository.stargazers_count.toString(),
        inline: true,
      })
      .setTimestamp(new Date());
  }
}
