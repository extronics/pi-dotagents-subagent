import { afterAll, beforeAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../extensions/subagent/index.ts";

type RegisteredTool = {
	name: string;
	description: string;
	execute: (...args: unknown[]) => Promise<{ content: { type: string; text: string }[] }>;
};

let root: string;
let previousAgentDir: string | undefined;
let previousHome: string | undefined;

beforeAll(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "dotagents-subagent-ext-"));
	previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	previousHome = process.env.HOME;
	// Isolate the user directories from the agents of the machine.
	process.env.PI_CODING_AGENT_DIR = path.join(root, "pi-agent");
	process.env.HOME = path.join(root, "home");
	const file = path.join(root, "repo/.agents/agents/reviewer/agent.md");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.mkdirSync(path.join(root, "repo/.git"));
	fs.writeFileSync(file, "---\nname: reviewer\ndescription: Reviews code\n---\n\nReview.\n");
});

afterAll(() => {
	process.env.PI_CODING_AGENT_DIR = previousAgentDir;
	process.env.HOME = previousHome;
	fs.rmSync(root, { recursive: true, force: true });
});

function registerTool(): RegisteredTool {
	let tool: RegisteredTool | undefined;
	extension({ registerTool: (t: RegisteredTool) => (tool = t) } as never);
	if (!tool) throw new Error("subagent tool not registered");
	return tool;
}

// No mode given: the tool does not start a process and lists the available agents.
async function availableAgents(params: object, trusted: boolean): Promise<string | undefined> {
	const ctx = { cwd: path.join(root, "repo"), hasUI: false, isProjectTrusted: () => trusted };
	const result = await registerTool().execute("call-1", params, undefined, undefined, ctx);
	return result.content[0]?.text;
}

test("the tool description names the .agents/agents directory", () => {
	const tool = registerTool();
	expect(tool.name).toBe("subagent");
	expect(tool.description).toContain(".agents/agents");
});

test("in a trusted project, the default scope includes project agents", async () => {
	expect(await availableAgents({}, true)).toContain("Available agents: reviewer (project)");
});

test("in an untrusted project, the default scope excludes project agents", async () => {
	expect(await availableAgents({}, false)).toContain("Available agents: none");
	expect(await availableAgents({ agentScope: "both" }, false)).toContain("Available agents: reviewer (project)");
});
