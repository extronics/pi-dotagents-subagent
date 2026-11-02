/**
 * Agent discovery and configuration
 *
 * Agents come from four directories. Later directories override earlier ones
 * when two agents have the same name:
 *
 *   1. `~/.pi/agent/agents`   pi user agents (upstream location)
 *   2. `~/.agents/agents`     dotagents global layer
 *   3. `.pi/agents`           pi project agents, nearest ancestor of the cwd (upstream location)
 *   4. `.agents/agents`       dotagents workspace layer, searched from the cwd up to the repository root
 *
 * Each directory can hold agents in two layouts:
 *
 *   <dir>/<name>/agent.md     dotagents layout (https://dotagentsprotocol.com/)
 *   <dir>/<name>.md           flat layout (upstream pi, Claude Code)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	/** The project directory with the highest precedence, for display. */
	projectAgentsDir: string | null;
}

/** The directories that `discoverAgents` reads. Tests set them explicitly. */
export interface AgentDirectories {
	cwd: string;
	/** pi agent directory. Default: `getAgentDir()`. */
	piAgentDir?: string;
	/** Home directory for the dotagents global layer. Default: `os.homedir()`. */
	homeDir?: string;
}

/**
 * Raw agent frontmatter. Values are `unknown` because `parseFrontmatter` runs a
 * real YAML parser, so any scalar or collection can appear here.
 *
 * A type alias rather than an interface: `parseFrontmatter` constrains its
 * parameter to `Record<string, unknown>`, and only an alias picks up the
 * implicit index signature that satisfies it.
 *
 * `id` and `enabled` come from the dotagents format. `name`, `description`,
 * `tools` and `model` are shared with upstream pi and Claude Code.
 */
type AgentFrontmatter = {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	enabled?: unknown;
	tools?: unknown;
	model?: unknown;
};

/** File name of an agent in the dotagents layout. */
const DOTAGENTS_AGENT_FILE = "agent.md";

/**
 * Claude Code model aliases. A file shared with Claude Code can contain them,
 * but they do not name a pi model, so the agent uses the model of the parent
 * session instead.
 */
const CLAUDE_MODEL_ALIASES = new Set(["inherit", "opus", "sonnet", "haiku", "fable", "opusplan"]);

/**
 * Claude Code built-in tool names and their pi equivalents. A file shared with
 * Claude Code names its tools in Claude Code spelling. Without this map, pi
 * would match none of them and the agent would run without tools.
 */
const CLAUDE_TOOL_NAMES: Record<string, string> = {
	Read: "read",
	Write: "write",
	Edit: "edit",
	MultiEdit: "edit",
	Bash: "bash",
	Grep: "grep",
	Glob: "find",
	LS: "ls",
};

/**
 * Normalize a frontmatter `tools` value to a list of pi tool names.
 *
 * Both spellings are valid YAML and both are in use:
 *
 *     tools: read, bash        # string
 *     tools: [read, bash]      # array
 *
 * so accept either. Anything else (a number, a map, a nested list) yields no
 * tools rather than throwing: this runs inside agent discovery, where a single
 * bad file must not take down every other agent in the same directory.
 *
 * Claude Code tool names are mapped to pi tool names. Other names stay as they
 * are; pi ignores names that match no tool.
 */
function parseToolList(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const tools = raw
		.filter((t): t is string => typeof t === "string")
		.map((t) => t.trim())
		.filter(Boolean)
		.map((t) => CLAUDE_TOOL_NAMES[t] ?? t);
	return tools.length > 0 ? [...new Set(tools)] : undefined;
}

function parseModel(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const model = value.trim();
	return model && !CLAUDE_MODEL_ALIASES.has(model.toLowerCase()) ? model : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Read one agent file. The name is the first of: frontmatter `id` (dotagents),
 * frontmatter `name`, `fallbackName` (the folder or file name).
 */
function loadAgentFile(filePath: string, fallbackName: string, source: "user" | "project"): AgentConfig | null {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}

	let parsed: { frontmatter: AgentFrontmatter; body: string };
	try {
		parsed = parseFrontmatter<AgentFrontmatter>(content);
	} catch {
		// Invalid YAML in one file must not stop the discovery of the other agents.
		return null;
	}
	const { frontmatter, body } = parsed;

	if (typeof frontmatter.description !== "string") return null;
	if (frontmatter.enabled === false) return null;

	return {
		name: nonEmptyString(frontmatter.id) ?? nonEmptyString(frontmatter.name) ?? fallbackName,
		description: frontmatter.description,
		tools: parseToolList(frontmatter.tools),
		model: parseModel(frontmatter.model),
		systemPrompt: body,
		source,
		filePath,
	};
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function isFile(p: string): boolean {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

/** Load the agents of one directory in both layouts, sorted by entry name. */
function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	let entries: string[];
	try {
		entries = fs.readdirSync(dir).sort();
	} catch {
		return [];
	}

	const agents: AgentConfig[] = [];
	for (const entry of entries) {
		const entryPath = path.join(dir, entry);
		let agent: AgentConfig | null = null;
		if (entry.endsWith(".md") && isFile(entryPath)) {
			agent = loadAgentFile(entryPath, entry.slice(0, -".md".length), source);
		} else if (isDirectory(entryPath) && isFile(path.join(entryPath, DOTAGENTS_AGENT_FILE))) {
			agent = loadAgentFile(path.join(entryPath, DOTAGENTS_AGENT_FILE), entry, source);
		}
		if (agent) agents.push(agent);
	}
	return agents;
}

/** Upstream rule: the nearest `.pi/agents` of the cwd or one of its ancestors. */
function findNearestPiAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

/**
 * The nearest `.agents/agents` of the cwd or one of its ancestors. The search
 * stops at the repository root (a directory with `.git`), as pi does for
 * `.agents/skills`. Outside a repository it continues to the file system root.
 */
function findNearestDotAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".agents", "agents");
		if (isDirectory(candidate)) return candidate;
		if (fs.existsSync(path.join(currentDir, ".git"))) return null;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	return discoverAgentsIn({ cwd }, scope);
}

export function discoverAgentsIn(dirs: AgentDirectories, scope: AgentScope): AgentDiscoveryResult {
	const userDirs = [
		path.join(dirs.piAgentDir ?? getAgentDir(), "agents"),
		path.join(dirs.homeDir ?? os.homedir(), ".agents", "agents"),
	];
	// Outside a repository, the search for `.agents/agents` can reach the home
	// directory. That directory is the global layer, not a project directory.
	const projectDirs = [findNearestPiAgentsDir(dirs.cwd), findNearestDotAgentsDir(dirs.cwd)].filter(
		(dir): dir is string => dir !== null && !userDirs.includes(dir),
	);

	// Later directories override earlier ones.
	const agentMap = new Map<string, AgentConfig>();
	if (scope !== "project") {
		for (const dir of userDirs) for (const agent of loadAgentsFromDir(dir, "user")) agentMap.set(agent.name, agent);
	}
	if (scope !== "user") {
		for (const dir of projectDirs) for (const agent of loadAgentsFromDir(dir, "project")) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir: projectDirs.at(-1) ?? null };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
