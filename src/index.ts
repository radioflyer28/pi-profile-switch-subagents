import path from "node:path";

import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import {
	resolveNamedChildProfile,
	type ResolvedChildProfileV1,
} from "pi-profile-switch/src/child-profile-resolver.ts";
import type { ProfileModel } from "pi-profile-switch/src/profile-catalog.ts";
import {
	registerChildProfileProvider,
	type ChildProfileProvider,
} from "pi-subagents/child-profiles";

export const ADAPTER_PROVIDER_NAME = "pi-profile-switch";
export const ADAPTER_PROTOTYPE_VERSION = "0.0.0-prototype";

export type AdapterTrustPolicy =
	| { mode: "deny" }
	| { mode: "persisted" }
	| { mode: "custom"; key: string; resolve(cwd: string): boolean | Promise<boolean> };

export interface PiProfileSubagentsAdapterOptions {
	agentDir: string;
	profilesDir?: string;
	providerName?: string;
	allowProjectProfiles?: boolean;
	trust?: AdapterTrustPolicy;
	validateModel?: { key: string; validate(model: ProfileModel): Promise<string | undefined> };
	piVersion?: string;
}

export interface PiProfileSubagentsAdapterHandle {
	readonly providerName: string;
	readonly key: string;
	readonly disposed: boolean;
	dispose(): void;
}

interface SharedRegistration {
	key: string;
	refs: number;
	disposeProvider: () => void;
}

interface SharedRegistry {
	registrations: Map<string, SharedRegistration>;
}

const SHARED_KEY = Symbol.for("pi-profile-subagents-adapter.registrations.v1");

function sharedRegistry(): SharedRegistry {
	const root = globalThis as Record<symbol, unknown>;
	let current = root[SHARED_KEY] as SharedRegistry | undefined;
	if (!current) {
		current = { registrations: new Map() };
		root[SHARED_KEY] = current;
	}
	return current;
}

function requiredNonEmpty(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
	return value.trim();
}

function optionalNonEmpty(value: unknown, label: string): string | undefined {
	return value === undefined ? undefined : requiredNonEmpty(value, label);
}

function trustKey(policy: AdapterTrustPolicy): string {
	if (policy.mode !== "custom") return policy.mode;
	return `custom:${requiredNonEmpty(policy.key, "trust.key")}`;
}

function registrationKey(options: Required<Pick<PiProfileSubagentsAdapterOptions, "agentDir" | "providerName" | "allowProjectProfiles" | "trust">> & PiProfileSubagentsAdapterOptions): string {
	return JSON.stringify({
		version: 1,
		agentDir: path.resolve(options.agentDir),
		profilesDir: options.profilesDir ? path.resolve(options.profilesDir) : null,
		providerName: options.providerName,
		allowProjectProfiles: options.allowProjectProfiles,
		trust: trustKey(options.trust),
		modelValidator: options.validateModel ? requiredNonEmpty(options.validateModel.key, "validateModel.key") : null,
		piVersion: options.piVersion ?? null,
	});
}

function resolveTrust(policy: AdapterTrustPolicy, agentDir: string, cwd: string): boolean | Promise<boolean> {
	if (policy.mode === "deny") return false;
	if (policy.mode === "custom") return policy.resolve(cwd);
	// Read on every request so a trust decision changed by another session is
	// observed without keeping mutable adapter-owned trust state.
	return new ProjectTrustStore(agentDir).get(cwd) === true;
}

function normalizeOptions(options: PiProfileSubagentsAdapterOptions) {
	const agentDir = path.resolve(requiredNonEmpty(options.agentDir, "agentDir"));
	const providerName = optionalNonEmpty(options.providerName, "providerName") ?? ADAPTER_PROVIDER_NAME;
	if (!/^[A-Za-z0-9._-]+$/.test(providerName)) throw new Error("providerName may contain only letters, numbers, dot, underscore, and hyphen.");
	const rawProfilesDir = optionalNonEmpty(options.profilesDir, "profilesDir");
	const profilesDir = rawProfilesDir ? path.resolve(rawProfilesDir) : undefined;
	const allowProjectProfiles = options.allowProjectProfiles === true;
	const trust = options.trust ?? { mode: "deny" as const };
	if (trust.mode !== "deny" && trust.mode !== "persisted" && trust.mode !== "custom") throw new Error("trust.mode must be deny, persisted, or custom.");
	if (trust.mode === "custom") {
		requiredNonEmpty(trust.key, "trust.key");
		if (typeof trust.resolve !== "function") throw new Error("trust.resolve must be a function for custom trust policy.");
	}
	if (options.validateModel) {
		requiredNonEmpty(options.validateModel.key, "validateModel.key");
		if (typeof options.validateModel.validate !== "function") throw new Error("validateModel.validate must be a function.");
	}
	if (allowProjectProfiles && trust.mode === "deny") {
		throw new Error("allowProjectProfiles requires a per-cwd persisted or custom trust policy.");
	}
	return { ...options, agentDir, providerName, profilesDir, allowProjectProfiles, trust };
}

function createProvider(options: ReturnType<typeof normalizeOptions>): ChildProfileProvider {
	return {
		name: options.providerName,
		async resolve({ name, cwd }): Promise<ResolvedChildProfileV1> {
			const projectTrusted = await resolveTrust(options.trust, options.agentDir, cwd);
			return resolveNamedChildProfile({
				name,
				cwd,
				agentDir: options.agentDir,
				...(options.profilesDir ? { profilesDir: options.profilesDir } : {}),
				projectTrusted,
				allowProjectProfiles: options.allowProjectProfiles,
				...(options.validateModel ? { validateModel: options.validateModel.validate } : {}),
				...(options.piVersion ? { piVersion: options.piVersion } : {}),
			});
		},
	};
}

/**
 * Register the pi-profile-switch resolver with pi-subagents for this process.
 * Identical registrations are reference counted; conflicting registrations for
 * the same provider name fail instead of silently replacing policy.
 */
export function installPiProfileSubagentsAdapter(options: PiProfileSubagentsAdapterOptions): PiProfileSubagentsAdapterHandle {
	const normalized = normalizeOptions(options);
	const key = registrationKey(normalized);
	const registrations = sharedRegistry().registrations;
	let shared = registrations.get(normalized.providerName);
	if (shared) {
		if (shared.key !== key) throw new Error(`Adapter provider '${normalized.providerName}' is already installed with different resolution or trust policy.`);
		shared.refs += 1;
	} else {
		shared = {
			key,
			refs: 1,
			disposeProvider: registerChildProfileProvider(createProvider(normalized)),
		};
		registrations.set(normalized.providerName, shared);
	}

	let disposed = false;
	return {
		providerName: normalized.providerName,
		key,
		get disposed() { return disposed; },
		dispose() {
			if (disposed) return;
			disposed = true;
			const current = registrations.get(normalized.providerName);
			if (!current || current.key !== key) return;
			current.refs -= 1;
			if (current.refs === 0) {
				current.disposeProvider();
				registrations.delete(normalized.providerName);
			}
		},
	};
}
