/**
 * Usage Analytics Tracker
 *
 * Tracks bot usage metrics including tool usage, user activity,
 * response times, and error rates. All data is stored in-memory
 * and resets on restart.
 */

export interface ToolUsageRecord {
  name: string;
  count: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
}

export interface UserActivityRecord {
  userId: string;
  messageCount: number;
  lastActive: Date;
  toolsUsed: Set<string>;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  messageCount: number;
  uniqueUsers: number;
  toolCalls: number;
  errors: number;
  avgResponseTimeMs: number;
}

export interface UsageStats {
  startedAt: Date;
  totalMessages: number;
  totalToolCalls: number;
  totalErrors: number;
  avgResponseTimeMs: number;
  uniqueUsers: number;
  topTools: Array<{ name: string; count: number; successRate: number }>;
  activeUsers: Array<{ userId: string; messageCount: number; lastActive: Date }>;
  dailyStats: DailyStats[];
}

export class UsageTracker {
  private readonly startedAt: Date;
  private readonly toolUsage: Map<string, ToolUsageRecord>;
  private readonly userActivity: Map<string, UserActivityRecord>;
  private readonly dailyStats: Map<string, DailyStats>;
  private readonly responseTimes: number[];
  private totalMessages: number;
  private totalErrors: number;

  // Configuration
  private readonly maxResponseTimeSamples: number;
  private readonly maxDailyStatsHistory: number;

  constructor(options?: { maxResponseTimeSamples?: number; maxDailyStatsHistory?: number }) {
    this.startedAt = new Date();
    this.toolUsage = new Map();
    this.userActivity = new Map();
    this.dailyStats = new Map();
    this.responseTimes = [];
    this.totalMessages = 0;
    this.totalErrors = 0;
    this.maxResponseTimeSamples = options?.maxResponseTimeSamples ?? 1000;
    this.maxDailyStatsHistory = options?.maxDailyStatsHistory ?? 30;
  }

  /**
   * Record a message from a user
   */
  recordMessage(userId: string): void {
    this.totalMessages++;

    // Update user activity
    const activity = this.userActivity.get(userId);
    if (activity) {
      activity.messageCount++;
      activity.lastActive = new Date();
    } else {
      this.userActivity.set(userId, {
        userId,
        messageCount: 1,
        lastActive: new Date(),
        toolsUsed: new Set(),
      });
    }

    // Update daily stats
    this.updateDailyStats((stats) => {
      stats.messageCount++;
    });
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    toolName: string,
    userId: string,
    options: { success: boolean; durationMs: number }
  ): void {
    const { success, durationMs } = options;

    // Update tool usage
    const usage = this.toolUsage.get(toolName);
    if (usage) {
      usage.count++;
      if (success) {
        usage.successCount++;
      } else {
        usage.errorCount++;
      }
      usage.totalDurationMs += durationMs;
    } else {
      this.toolUsage.set(toolName, {
        name: toolName,
        count: 1,
        successCount: success ? 1 : 0,
        errorCount: success ? 0 : 1,
        totalDurationMs: durationMs,
      });
    }

    // Update user's tools used
    const activity = this.userActivity.get(userId);
    if (activity) {
      activity.toolsUsed.add(toolName);
    }

    // Update daily stats
    this.updateDailyStats((stats) => {
      stats.toolCalls++;
      if (!success) {
        stats.errors++;
      }
    });

    // Track errors
    if (!success) {
      this.totalErrors++;
    }
  }

  /**
   * Record response time for a message
   */
  recordResponseTime(durationMs: number): void {
    this.responseTimes.push(durationMs);

    // Keep only the last N samples
    if (this.responseTimes.length > this.maxResponseTimeSamples) {
      this.responseTimes.shift();
    }

    // Update daily average
    this.updateDailyStats((stats) => {
      const currentTotal = stats.avgResponseTimeMs * (stats.messageCount - 1);
      stats.avgResponseTimeMs = Math.round((currentTotal + durationMs) / stats.messageCount);
    });
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.totalErrors++;
    this.updateDailyStats((stats) => {
      stats.errors++;
    });
  }

  /**
   * Get comprehensive usage statistics
   */
  getStats(): UsageStats {
    // Calculate average response time
    const avgResponseTimeMs =
      this.responseTimes.length > 0
        ? Math.round(
            this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
          )
        : 0;

    // Get top tools by usage
    const topTools = Array.from(this.toolUsage.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => ({
        name: t.name,
        count: t.count,
        successRate: t.count > 0 ? Math.round((t.successCount / t.count) * 100) : 0,
      }));

    // Get most active users
    const activeUsers = Array.from(this.userActivity.values())
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10)
      .map((u) => ({
        userId: u.userId,
        messageCount: u.messageCount,
        lastActive: u.lastActive,
      }));

    // Get daily stats sorted by date
    const dailyStatsArray = Array.from(this.dailyStats.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-this.maxDailyStatsHistory);

    return {
      startedAt: this.startedAt,
      totalMessages: this.totalMessages,
      totalToolCalls: Array.from(this.toolUsage.values()).reduce((sum, t) => sum + t.count, 0),
      totalErrors: this.totalErrors,
      avgResponseTimeMs,
      uniqueUsers: this.userActivity.size,
      topTools,
      activeUsers,
      dailyStats: dailyStatsArray,
    };
  }

  /**
   * Get a summary string for display
   */
  getSummary(): string {
    const stats = this.getStats();
    const uptime = this.getUptimeString();

    const lines = [
      `Bot Statistics (uptime: ${uptime})`,
      ``,
      `Messages: ${stats.totalMessages}`,
      `Tool Calls: ${stats.totalToolCalls}`,
      `Unique Users: ${stats.uniqueUsers}`,
      `Avg Response: ${stats.avgResponseTimeMs}ms`,
      `Error Rate: ${stats.totalMessages > 0 ? ((stats.totalErrors / stats.totalMessages) * 100).toFixed(1) : 0}%`,
    ];

    if (stats.topTools.length > 0) {
      lines.push(``);
      lines.push(`Top Tools:`);
      for (const tool of stats.topTools.slice(0, 5)) {
        lines.push(`  ${tool.name}: ${tool.count} calls (${tool.successRate}% success)`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get uptime as a human-readable string
   */
  private getUptimeString(): string {
    const ms = Date.now() - this.startedAt.getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Update daily stats with a modifier function
   */
  private updateDailyStats(modifier: (stats: DailyStats) => void): void {
    const today = new Date().toISOString().split("T")[0]!;
    let stats = this.dailyStats.get(today);

    if (!stats) {
      stats = {
        date: today,
        messageCount: 0,
        uniqueUsers: 0,
        toolCalls: 0,
        errors: 0,
        avgResponseTimeMs: 0,
      };
      this.dailyStats.set(today, stats);

      // Clean up old daily stats
      this.cleanupOldDailyStats();
    }

    // Update unique users for today
    stats.uniqueUsers = this.countUsersActiveToday();

    modifier(stats);
  }

  /**
   * Count users active today
   */
  private countUsersActiveToday(): number {
    const today = new Date().toISOString().split("T")[0]!;
    let count = 0;
    for (const activity of this.userActivity.values()) {
      if (activity.lastActive.toISOString().split("T")[0] === today) {
        count++;
      }
    }
    return count;
  }

  /**
   * Remove daily stats older than maxDailyStatsHistory days
   */
  private cleanupOldDailyStats(): void {
    if (this.dailyStats.size <= this.maxDailyStatsHistory) {
      return;
    }

    const dates = Array.from(this.dailyStats.keys()).sort();
    const toRemove = dates.slice(0, dates.length - this.maxDailyStatsHistory);
    for (const date of toRemove) {
      this.dailyStats.delete(date);
    }
  }

  /**
   * Reset all statistics (useful for testing)
   */
  reset(): void {
    this.toolUsage.clear();
    this.userActivity.clear();
    this.dailyStats.clear();
    this.responseTimes.length = 0;
    this.totalMessages = 0;
    this.totalErrors = 0;
  }
}
