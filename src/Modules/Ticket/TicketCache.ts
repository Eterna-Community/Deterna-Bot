import type { ITicket, TicketType } from "../../config";

export class TicketCache {
  private tickets: Record<TicketType, ITicket[]> = {
    general: [],
    bug: [],
    feature: [],
    application: [],
    other: [],
  };

  // Cache für schnellere Lookups
  private channelToTicketMap: Map<string, ITicket> = new Map();
  private userToTicketsMap: Map<string, Set<string>> = new Map(); // userId -> Set of channelIds

  public addTicket(ticket: ITicket): void {
    this.tickets[ticket.Type].push(ticket);
    this.channelToTicketMap.set(ticket.ChannelId, ticket);

    // Update user mapping
    ticket.Users.forEach((userId) => {
      if (!this.userToTicketsMap.has(userId)) {
        this.userToTicketsMap.set(userId, new Set());
      }
      this.userToTicketsMap.get(userId)!.add(ticket.ChannelId);
    });
  }

  public removeTicket(channelId: string): boolean {
    const ticket = this.channelToTicketMap.get(channelId);
    if (!ticket) return false;

    // Remove from type array
    const typeArray = this.tickets[ticket.Type];
    const index = typeArray.findIndex((t) => t.ChannelId === channelId);
    if (index > -1) {
      typeArray.splice(index, 1);
    }

    // Remove from maps
    this.channelToTicketMap.delete(channelId);
    ticket.Users.forEach((userId) => {
      const userTickets = this.userToTicketsMap.get(userId);
      if (userTickets) {
        userTickets.delete(channelId);
        if (userTickets.size === 0) {
          this.userToTicketsMap.delete(userId);
        }
      }
    });

    return true;
  }

  public getTickets(type: TicketType): ITicket[] {
    return [...this.tickets[type]]; // Return copy to prevent external modification
  }

  public addUserToTicket(userId: string, channelId: string): boolean {
    const ticket = this.channelToTicketMap.get(channelId);
    if (!ticket || ticket.Users.includes(userId)) return false;

    ticket.Users.push(userId);

    // Update user mapping
    if (!this.userToTicketsMap.has(userId)) {
      this.userToTicketsMap.set(userId, new Set());
    }
    this.userToTicketsMap.get(userId)!.add(channelId);

    return true;
  }

  public removeUserFromTicket(userId: string, channelId: string): boolean {
    const ticket = this.channelToTicketMap.get(channelId);
    if (!ticket) return false;

    const index = ticket.Users.indexOf(userId);
    if (index === -1) return false;

    ticket.Users.splice(index, 1);

    // Update user mapping
    const userTickets = this.userToTicketsMap.get(userId);
    if (userTickets) {
      userTickets.delete(channelId);
      if (userTickets.size === 0) {
        this.userToTicketsMap.delete(userId);
      }
    }

    return true;
  }

  public closeTicket(
    channelId: string,
    closeReason?: string,
    closedBy?: string
  ): boolean {
    const ticket = this.channelToTicketMap.get(channelId);
    if (!ticket || ticket.Closed) return false;

    ticket.Closed = true;
    ticket.ClosedAt = new Date();
    if (closeReason) ticket.CloseReason = closeReason;
    if (closedBy) ticket.ClosedBy = closedBy;

    return true;
  }

  public reopenTicket(channelId: string): boolean {
    const ticket = this.channelToTicketMap.get(channelId);
    if (!ticket || !ticket.Closed) return false;

    ticket.Closed = false;
    ticket.ClosedAt = null;
    ticket.CloseReason = undefined;
    ticket.ClosedBy = undefined;

    return true;
  }

  // Optimized lookups using Maps
  public getTicket(channelId: string): ITicket | undefined {
    return this.channelToTicketMap.get(channelId);
  }

  public getTicketByUser(
    userId: string,
    type?: TicketType
  ): ITicket | undefined {
    const userChannels = this.userToTicketsMap.get(userId);
    if (!userChannels) return undefined;

    for (const channelId of userChannels) {
      const ticket = this.channelToTicketMap.get(channelId);
      if (ticket && (!type || ticket.Type === type)) {
        return ticket;
      }
    }
    return undefined;
  }

  public getTicketsByUser(userId: string): ITicket[] {
    const userChannels = this.userToTicketsMap.get(userId);
    if (!userChannels) return [];

    return Array.from(userChannels)
      .map((channelId) => this.channelToTicketMap.get(channelId))
      .filter((ticket): ticket is ITicket => ticket !== undefined);
  }

  public getOpenTickets(type?: TicketType): ITicket[] {
    if (type) {
      return this.tickets[type].filter((ticket) => !ticket.Closed);
    }

    return this.getAllTickets().filter((ticket) => !ticket.Closed);
  }

  public getClosedTickets(type?: TicketType): ITicket[] {
    if (type) {
      return this.tickets[type].filter((ticket) => ticket.Closed);
    }

    return this.getAllTickets().filter((ticket) => ticket.Closed);
  }

  public getAllTickets(): ITicket[] {
    return Object.values(this.tickets).flat();
  }

  // Statistics
  public getTicketStats(): {
    total: number;
    open: number;
    closed: number;
    byType: Record<TicketType, { total: number; open: number; closed: number }>;
  } {
    const stats = {
      total: 0,
      open: 0,
      closed: 0,
      byType: {} as Record<
        TicketType,
        { total: number; open: number; closed: number }
      >,
    };

    Object.entries(this.tickets).forEach(([type, tickets]) => {
      const ticketType = type as TicketType;
      const openCount = tickets.filter((t) => !t.Closed).length;
      const closedCount = tickets.filter((t) => t.Closed).length;

      stats.byType[ticketType] = {
        total: tickets.length,
        open: openCount,
        closed: closedCount,
      };

      stats.total += tickets.length;
      stats.open += openCount;
      stats.closed += closedCount;
    });

    return stats;
  }

  // User specific methods
  public hasOpenTicket(userId: string, type?: TicketType): boolean {
    const userTickets = this.getTicketsByUser(userId);
    return userTickets.some(
      (ticket) => !ticket.Closed && (!type || ticket.Type === type)
    );
  }

  public getUserTicketCount(
    userId: string,
    includeClosedTickets = false
  ): number {
    const userTickets = this.getTicketsByUser(userId);
    return includeClosedTickets
      ? userTickets.length
      : userTickets.filter((t) => !t.Closed).length;
  }

  // Search and filter methods
  public searchTickets(query: {
    userId?: string;
    type?: TicketType;
    isOpen?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
  }): ITicket[] {
    let results = this.getAllTickets();

    if (query.userId) {
      results = results.filter((ticket) =>
        ticket.Users.includes(query.userId!)
      );
    }

    if (query.type) {
      results = results.filter((ticket) => ticket.Type === query.type);
    }

    if (query.isOpen !== undefined) {
      results = results.filter((ticket) => !ticket.Closed === query.isOpen);
    }

    if (query.createdAfter) {
      results = results.filter(
        (ticket) => ticket.CreatedAt >= query.createdAfter!
      );
    }

    if (query.createdBefore) {
      results = results.filter(
        (ticket) => ticket.CreatedAt <= query.createdBefore!
      );
    }

    return results;
  }

  // Ticket Specific Functions (simplified)
  public getGeneralTickets(): ITicket[] {
    return [...this.tickets.general];
  }

  public getBugTickets(): ITicket[] {
    return [...this.tickets.bug];
  }

  public getFeatureTickets(): ITicket[] {
    return [...this.tickets.feature];
  }

  public getApplicationTickets(): ITicket[] {
    return [...this.tickets.application];
  }

  public getOtherTickets(): ITicket[] {
    return [...this.tickets.other];
  }

  public clear(): void {
    this.tickets = {
      general: [],
      bug: [],
      feature: [],
      application: [],
      other: [],
    };
    this.channelToTicketMap.clear();
    this.userToTicketsMap.clear();
  }

  // Debug/Development helpers
  public size(): number {
    return this.channelToTicketMap.size;
  }

  public isEmpty(): boolean {
    return this.channelToTicketMap.size === 0;
  }
}
