import { supportsXhigh } from "./models.js";
import { type AnthropicOptions, streamAnthropic } from "./providers/anthropic.js";
import { type GoogleOptions, streamGoogle } from "./providers/google.js";
import {
	type GoogleGeminiCliOptions,
	type GoogleThinkingLevel,
	streamGoogleGeminiCli,
} from "./providers/google-gemini-cli.js";
import { type GoogleVertexOptions, streamGoogleVertex } from "./providers/google-vertex.js";
import { type OpenAICodexResponsesOptions, streamOpenAICodexResponses } from "./providers/openai-codex-responses.js";
import { type OpenAICompletionsOptions, streamOpenAICompletions } from "./providers/openai-completions.js";
import { type OpenAIResponsesOptions, streamOpenAIResponses } from "./providers/openai-responses.js";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	KnownProvider,
	Model,
	OptionsForApi,
	SimpleStreamOptions,
	ThinkingLevel,
} from "./types.js";

const apiKeys: Map<string, string> = new Map();

const envMap: Record<string, string> = {
	openai: "OPENAI_API_KEY",
	anthropic: "ANTHROPIC_API_KEY",
	google: "GEMINI_API_KEY",
	groq: "GROQ_API_KEY",
	cerebras: "CEREBRAS_API_KEY",
	xai: "XAI_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	zai: "ZAI_API_KEY",
	mistral: "MISTRAL_API_KEY",
};

export function setApiKey(provider: KnownProvider, key: string): void;
export function setApiKey(provider: string, key: string): void;
export function setApiKey(provider: any, key: string): void {
	apiKeys.set(provider, key);
}

export function getEnvApiKey(provider: KnownProvider): string | undefined;
export function getEnvApiKey(provider: string): string | undefined;
export function getEnvApiKey(provider: any): string | undefined {
	if (provider === "github-copilot") {
		return process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	}

	const envVar = envMap[provider];
	return envVar ? process.env[envVar] : undefined;
}

export function getApiKey(provider: KnownProvider): string | undefined;
export function getApiKey(provider: string): string | undefined;
export function getApiKey(provider: any): string | undefined {
	// Check explicit keys first
	const key = apiKeys.get(provider);
	if (key) return key;

	return getEnvApiKey(provider);
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: OptionsForApi<TApi>,
): AssistantMessageEventStream {
	const apiKey = options?.apiKey || getApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}
	const providerOptions = { ...options, apiKey };

	const api: Api = model.api;
	switch (api) {
		case "anthropic-messages":
			return streamAnthropic(model as Model<"anthropic-messages">, context, providerOptions);

		case "openai-completions":
			return streamOpenAICompletions(model as Model<"openai-completions">, context, providerOptions as any);

		case "openai-responses":
			return streamOpenAIResponses(model as Model<"openai-responses">, context, providerOptions as any);

		case "google-generative-ai":
			return streamGoogle(model as Model<"google-generative-ai">, context, providerOptions);

		case "google-gemini-cli":
			return streamGoogleGeminiCli(
				model as Model<"google-gemini-cli">,
				context,
				providerOptions as GoogleGeminiCliOptions,
			);

		case "google-vertex":
			return streamGoogleVertex(model as Model<"google-vertex">, context, providerOptions as GoogleVertexOptions);

		case "openai-codex-responses":
			return streamOpenAICodexResponses(
				model as Model<"openai-codex-responses">,
				context,
				providerOptions as OpenAICodexResponsesOptions,
			);

		default: {
			// This should never be reached if all Api cases are handled
			const _exhaustive: never = api;
			throw new Error(`Unhandled API: ${_exhaustive}`);
		}
	}
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: OptionsForApi<TApi>,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const apiKey = options?.apiKey || getApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}

	const providerOptions = mapOptionsForApi(model, options, apiKey);
	return stream(model, context, providerOptions);
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const s = streamSimple(model, context, options);
	return s.result();
}

function mapOptionsForApi<TApi extends Api>(
	model: Model<TApi>,
	options?: SimpleStreamOptions,
	apiKey?: string,
): OptionsForApi<TApi> {
	const base = {
		temperature: options?.temperature,
		maxTokens: options?.maxTokens || Math.min(model.maxTokens, 32000),
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
	};

	// Helper to clamp xhigh to high for providers that don't support it
	const clampReasoning = (effort: ThinkingLevel | undefined): ClampedReasoningEffort | undefined =>
		effort === "xhigh" ? "high" : effort;

	switch (model.api) {
		case "anthropic-messages": {
			// Explicitly disable thinking when reasoning is not specified
			if (!options?.reasoning) {
				return { ...base, thinkingEnabled: false } satisfies AnthropicOptions;
			}

			const anthropicBudgets: Record<ClampedReasoningEffort, number> = {
				minimal: 1024,
				low: 2048,
				medium: 8192,
				high: 16384,
			};
			const effort = clampReasoning(options.reasoning)!;

			return {
				...base,
				thinkingEnabled: true,
				thinkingBudgetTokens: anthropicBudgets[effort],
			} satisfies AnthropicOptions;
		}

		case "openai-completions":
			return {
				...base,
				reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
			} satisfies OpenAICompletionsOptions;

		case "openai-responses":
			return {
				...base,
				reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
			} satisfies OpenAIResponsesOptions;

		case "openai-codex-responses":
			return {
				...base,
				reasoningEffort: supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning),
			} satisfies OpenAICodexResponsesOptions;

		case "google-generative-ai": {
			// Explicitly disable thinking when reasoning is not specified
			// This is needed because Gemini has "dynamic thinking" enabled by default
			if (!options?.reasoning) {
				return { ...base, thinking: { enabled: false } } satisfies GoogleOptions;
			}

			const googleModel = model as GoogleThinkingModel;
			const effort = clampReasoning(options.reasoning)!;

			// Gemini 3 models use thinkingLevel exclusively instead of thinkingBudget.
			// https://ai.google.dev/gemini-api/docs/thinking#set-budget
			if (isGemini3ProModel(googleModel) || isGemini3FlashModel(googleModel)) {
				return {
					...base,
					thinking: {
						enabled: true,
						level: getGemini3ThinkingLevel(effort, googleModel),
					},
				} satisfies GoogleOptions;
			}

			return {
				...base,
				thinking: {
					enabled: true,
					budgetTokens: getGoogleBudget(googleModel, effort),
				},
			} satisfies GoogleOptions;
		}

		case "google-gemini-cli": {
			if (!options?.reasoning) {
				return { ...base, thinking: { enabled: false } } satisfies GoogleGeminiCliOptions;
			}

			const googleModel = model as GoogleThinkingModel;
			const effort = clampReasoning(options.reasoning)!;

			if (isGemini3ProModel(googleModel) || isGemini3FlashModel(googleModel)) {
				return {
					...base,
					thinking: {
						enabled: true,
						level: getGemini3ThinkingLevel(effort, googleModel),
					},
				} satisfies GoogleGeminiCliOptions;
			}

			return {
				...base,
				thinking: {
					enabled: true,
					budgetTokens: getGoogleBudget(googleModel, effort),
				},
			} satisfies GoogleGeminiCliOptions;
		}

		case "google-vertex": {
			if (!options?.reasoning) {
				return { ...base, thinking: { enabled: false } } satisfies GoogleVertexOptions;
			}

			const googleModel = model as GoogleThinkingModel;
			const effort = clampReasoning(options.reasoning)!;

			if (isGemini3ProModel(googleModel) || isGemini3FlashModel(googleModel)) {
				return {
					...base,
					thinking: {
						enabled: true,
						level: getGemini3ThinkingLevel(effort, googleModel),
					},
				} satisfies GoogleVertexOptions;
			}

			return {
				...base,
				thinking: {
					enabled: true,
					budgetTokens: getGoogleBudget(googleModel, effort),
				},
			} satisfies GoogleVertexOptions;
		}

		default: {
			// Exhaustiveness check
			const _exhaustive: never = model.api;
			throw new Error(`Unhandled API in mapOptionsForApi: ${_exhaustive}`);
		}
	}
}

type ClampedReasoningEffort = Exclude<ThinkingLevel, "xhigh">;

type GoogleThinkingModel = Model<"google-generative-ai" | "google-gemini-cli" | "google-vertex">;

function isGemini3ProModel(model: GoogleThinkingModel): boolean {
	// Covers gemini-3-pro, gemini-3-pro-preview, and possible other prefixed ids in the future
	return model.id.includes("3-pro");
}

function isGemini3FlashModel(model: GoogleThinkingModel): boolean {
	// Covers gemini-3-flash, gemini-3-flash-preview, and possible other prefixed ids in the future
	return model.id.includes("3-flash");
}

function getGemini3ThinkingLevel(effort: ClampedReasoningEffort, model: GoogleThinkingModel): GoogleThinkingLevel {
	if (isGemini3ProModel(model)) {
		// Gemini 3 Pro only supports LOW/HIGH (for now)
		switch (effort) {
			case "minimal":
			case "low":
				return "LOW";
			case "medium":
			case "high":
				return "HIGH";
		}
	}

	if (isGemini3FlashModel(model)) {
		switch (effort) {
			case "minimal":
				return "MINIMAL";
			case "low":
				return "LOW";
			case "medium":
				return "MEDIUM";
			case "high":
				return "HIGH";
		}
	}

	return "THINKING_LEVEL_UNSPECIFIED";
}

function getGoogleBudget(model: GoogleThinkingModel, effort: ClampedReasoningEffort): number {
	// See https://ai.google.dev/gemini-api/docs/thinking#set-budget
	if (model.id.includes("2.5-pro")) {
		const budgets: Record<ClampedReasoningEffort, number> = {
			minimal: 128,
			low: 2048,
			medium: 8192,
			high: 32768,
		};
		return budgets[effort];
	}

	if (model.id.includes("2.5-flash")) {
		// Covers 2.5-flash-lite as well
		const budgets: Record<ClampedReasoningEffort, number> = {
			minimal: 128,
			low: 2048,
			medium: 8192,
			high: 24576,
		};
		return budgets[effort];
	}

	// Unknown model - use dynamic
	return -1;
}
