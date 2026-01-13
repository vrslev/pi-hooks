/**
 * Context management for mom.
 *
 * Mom uses two files per channel:
 * - context.jsonl: Structured API messages for LLM context (same format as coding-agent sessions)
 * - log.jsonl: Human-readable channel history for grep (no tool results)
 *
 * This module provides:
 * - MomSettingsManager: Simple settings for mom
 * - syncLogToContext: Sync channel log.jsonl into context.jsonl
 */

import type { Message } from "@mariozechner/pi-ai";
import { type SessionEntry, SessionManager } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// ============================================================================
// MomSettingsManager - Simple settings for mom
// ============================================================================

export interface MomCompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export interface MomRetrySettings {
	enabled: boolean;
	maxRetries: number;
	baseDelayMs: number;
}

export interface MomUsageSummarySettings {
	enabled?: boolean;
	formatter?: string;
}

export type DiscordProfileStatus = "online" | "idle" | "dnd" | "invisible";

export type DiscordProfileActivityType = "Playing" | "Watching" | "Listening" | "Competing" | "Streaming";

export interface DiscordProfileSettings {
	username?: string;
	/**
	 * Discord avatar to set for the bot user.
	 * - If this is a URL (http/https), mom will download it.
	 * - Otherwise, this is treated as a local file path (absolute or relative to workspace root).
	 * - Set to an empty string ("") to clear the avatar.
	 */
	avatar?: string;
	status?: DiscordProfileStatus;
	activity?: { name: string; type: DiscordProfileActivityType };
}

export interface SlackProfileSettings {
	/**
	 * Slack message authorship overrides are scope gated:
	 * - requires `chat:write.customize` to set `username`/`icon_*` in `chat.postMessage`
	 */
	username?: string;
	iconUrl?: string;
	iconEmoji?: string;
}

export interface BotProfileSettings {
	discord?: DiscordProfileSettings;
	slack?: SlackProfileSettings;
}

export type TransportType = "slack" | "discord";

export interface AllowDMsPerTransport {
	slack?: boolean;
	discord?: boolean;
}

export interface MomSettings {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
	theme?: string;
	branchSummary?: { reserveTokens?: number };
	compaction?: Partial<MomCompactionSettings>;
	retry?: Partial<MomRetrySettings>;
	usageSummary?: boolean | Partial<MomUsageSummarySettings>;
	profile?: BotProfileSettings;
	allowDMs?: boolean | AllowDMsPerTransport;
	dmAllowlist?: string[];
	showDetails?: boolean;
	showToolResults?: boolean;
	collapseDetailsOnComplete?: boolean;
}

const DEFAULT_COMPACTION: MomCompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

const DEFAULT_RETRY: MomRetrySettings = {
	enabled: true,
	maxRetries: 3,
	baseDelayMs: 2000,
};

export interface ResolvedUsageSummarySettings {
	enabled: boolean;
	formatter?: string;
}

/**
 * Settings manager for mom.
 * Stores settings in the workspace root directory.
 */
export class MomSettingsManager {
	private settingsPath: string;
	private settings: MomSettings;

	constructor(workspaceDir: string) {
		this.settingsPath = join(workspaceDir, "settings.json");
		this.settings = this.load();
	}

	private load(): MomSettings {
		if (!existsSync(this.settingsPath)) {
			return {};
		}

		try {
			const content = readFileSync(this.settingsPath, "utf-8");
			return JSON.parse(content);
		} catch {
			return {};
		}
	}

	private save(): void {
		try {
			const dir = dirname(this.settingsPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
		} catch (error) {
			console.error(`Warning: Could not save settings file: ${error}`);
		}
	}

	getCompactionSettings(): MomCompactionSettings {
		return {
			...DEFAULT_COMPACTION,
			...this.settings.compaction,
		};
	}

	getCompactionEnabled(): boolean {
		return this.settings.compaction?.enabled ?? DEFAULT_COMPACTION.enabled;
	}

	setCompactionEnabled(enabled: boolean): void {
		this.settings.compaction = { ...this.settings.compaction, enabled };
		this.save();
	}

	getRetrySettings(): MomRetrySettings {
		return {
			...DEFAULT_RETRY,
			...this.settings.retry,
		};
	}

	getRetryEnabled(): boolean {
		return this.settings.retry?.enabled ?? DEFAULT_RETRY.enabled;
	}

	setRetryEnabled(enabled: boolean): void {
		this.settings.retry = { ...this.settings.retry, enabled };
		this.save();
	}

	getUsageSummarySettings(): ResolvedUsageSummarySettings {
		const raw = this.settings.usageSummary;
		if (typeof raw === "boolean") {
			return { enabled: raw };
		}
		return {
			enabled: raw?.enabled ?? true,
			formatter: raw?.formatter,
		};
	}

	getDefaultModel(): string | undefined {
		return this.settings.defaultModel;
	}

	getDefaultProvider(): string | undefined {
		return this.settings.defaultProvider;
	}

	setDefaultModelAndProvider(provider: string, modelId: string): void {
		this.settings.defaultProvider = provider;
		this.settings.defaultModel = modelId;
		this.save();
	}

	getDefaultThinkingLevel(): string {
		return this.settings.defaultThinkingLevel || "off";
	}

	setDefaultThinkingLevel(level: string): void {
		this.settings.defaultThinkingLevel = level as MomSettings["defaultThinkingLevel"];
		this.save();
	}

	getSteeringMode(): "all" | "one-at-a-time" {
		return this.settings.steeringMode ?? "one-at-a-time";
	}

	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.settings.steeringMode = mode;
		this.save();
	}

	getFollowUpMode(): "all" | "one-at-a-time" {
		return this.settings.followUpMode ?? "one-at-a-time";
	}

	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.settings.followUpMode = mode;
		this.save();
	}

	getTheme(): string | undefined {
		return this.settings.theme;
	}

	setTheme(theme: string): void {
		this.settings.theme = theme;
		this.save();
	}

	getBranchSummarySettings(): { reserveTokens: number } {
		return {
			reserveTokens: this.settings.branchSummary?.reserveTokens ?? 16384,
		};
	}

	getProfileSettings(): BotProfileSettings {
		return this.settings.profile ?? {};
	}

	getDiscordProfileSettings(): DiscordProfileSettings {
		return this.settings.profile?.discord ?? {};
	}

	getSlackProfileSettings(): SlackProfileSettings {
		return this.settings.profile?.slack ?? {};
	}

	canUserDM(transport: TransportType, userId: string): boolean {
		const allowDMs = this.settings.allowDMs;
		let allowed: boolean;

		if (typeof allowDMs === "boolean") {
			allowed = allowDMs;
		} else if (typeof allowDMs === "object" && allowDMs !== null) {
			const transportDefault = transport === "slack";
			allowed = allowDMs[transport] ?? transportDefault;
		} else {
			allowed = transport === "slack";
		}

		if (!allowed) return false;
		const allowlist = this.settings.dmAllowlist ?? [];
		if (allowlist.length === 0) return true;
		return allowlist.includes(userId);
	}

	get showDetails(): boolean {
		return this.settings.showDetails ?? true;
	}

	get showToolResults(): boolean {
		return this.settings.showToolResults ?? true;
	}

	get collapseDetailsOnComplete(): boolean {
		return this.settings.collapseDetailsOnComplete ?? false;
	}

	setDiscordProfile(profile: Partial<DiscordProfileSettings>): void {
		const existing = this.settings.profile?.discord ?? {};
		this.settings.profile = { ...this.settings.profile, discord: { ...existing, ...profile } };
		this.save();
	}

	setSlackProfile(profile: Partial<SlackProfileSettings>): void {
		const existing = this.settings.profile?.slack ?? {};
		this.settings.profile = { ...this.settings.profile, slack: { ...existing, ...profile } };
		this.save();
	}

	// Compatibility methods for AgentSession
	getQueueMode(): "all" | "one-at-a-time" {
		return "one-at-a-time"; // Mom processes one message at a time
	}

	setQueueMode(_mode: "all" | "one-at-a-time"): void {
		// No-op for mom
	}

	getHookPaths(): string[] {
		return []; // Mom doesn't use hooks
	}

	getHookTimeout(): number {
		return 30000;
	}
}

// ============================================================================
// Sync log.jsonl to context.jsonl
// ============================================================================

/**
 * Sync user messages from log.jsonl to context.jsonl.
 *
 * This ensures that messages logged while mom wasn't running (channel chatter,
 * backfilled messages, messages while busy) are added to the LLM context.
 *
 * @param channelDir - Path to channel directory
 * @param options - Transport-specific exclusion rules
 * @returns Number of messages synced
 */
export type SyncLogToContextOptions =
	| { mode: "slack"; excludeAfterTs?: string }
	| { mode: "discord"; excludeTs?: string };

export function syncLogToContext(channelDir: string, options?: SyncLogToContextOptions): number {
	const logFile = join(channelDir, "log.jsonl");
	const contextFile = join(channelDir, "context.jsonl");

	if (!existsSync(logFile)) return 0;

	if (!existsSync(channelDir)) {
		mkdirSync(channelDir, { recursive: true });
	}

	const sessionManager = SessionManager.open(contextFile, channelDir);

	const timestampPrefixRegex = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\] /;

	const normalizeUserContentForDedup = (content: string): string => {
		let normalized = content.replace(timestampPrefixRegex, "");
		const attachmentsIdx =
			normalized.indexOf("\n\n<attachments>\n") !== -1
				? normalized.indexOf("\n\n<attachments>\n")
				: normalized.indexOf("\n\n<slack_attachments>\n");
		if (attachmentsIdx !== -1) {
			normalized = normalized.substring(0, attachmentsIdx);
		}
		return normalized;
	};

	const existingLogDates = new Set<string>();
	const existingUserMessages = new Set<string>();

	for (const entry of sessionManager.getEntries()) {
		if (entry.type !== "message") continue;
		if (entry.message.role !== "user") continue;

		const rawContent =
			typeof entry.message.content === "string"
				? entry.message.content
				: Array.isArray(entry.message.content) && entry.message.content.length > 0
					? (entry.message.content[0] as { text?: string }).text
					: undefined;

		if (typeof rawContent !== "string") continue;

		const normalized = normalizeUserContentForDedup(rawContent);
		if (normalized) {
			existingUserMessages.add(normalized);
		}

		if (entry.timestamp && !timestampPrefixRegex.test(rawContent)) {
			existingLogDates.add(entry.timestamp);
		}
	}

	const shouldExcludeByTs = (ts: string): boolean => {
		if (!options) return false;
		if (options.mode === "slack") {
			return Boolean(options.excludeAfterTs && ts >= options.excludeAfterTs);
		}
		return Boolean(options.excludeTs && ts === options.excludeTs);
	};

	const logContent = readFileSync(logFile, "utf-8");
	const logLines = logContent.trim().split("\n").filter(Boolean);

	interface LogEntry {
		date?: string;
		ts?: string;
		user?: string;
		userName?: string;
		text?: string;
		isBot?: boolean;
	}

	let syncedCount = 0;
	for (const line of logLines) {
		let entry: LogEntry;
		try {
			entry = JSON.parse(line) as LogEntry;
		} catch {
			continue;
		}

		if (entry.isBot) continue;
		if (!entry.ts || !entry.date) continue;
		if (shouldExcludeByTs(entry.ts)) continue;

		if (existingLogDates.has(entry.date)) continue;

		const userName = entry.userName || entry.user || "unknown";
		const text = entry.text || "";
		const content = `[${userName}]: ${text}`;

		if (existingUserMessages.has(content)) continue;

		const msgTime = new Date(entry.date).getTime();
		const timestampMs = Number.isFinite(msgTime) ? msgTime : Date.now();

		sessionManager.appendMessage({
			role: "user",
			content,
			timestamp: timestampMs,
		} satisfies Message);

		existingLogDates.add(entry.date);
		existingUserMessages.add(content);
		syncedCount++;
	}

	if (syncedCount > 0) {
		const header = sessionManager.getHeader();
		const entries = sessionManager.getEntries() as SessionEntry[];
		const payload = header ? [header, ...entries] : entries;
		writeFileSync(contextFile, `${payload.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
	}

	return syncedCount;
}
