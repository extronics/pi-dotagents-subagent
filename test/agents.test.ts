import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type AgentScope, discoverAgentsIn } from "../extensions/subagent/agents.ts";

let root: string;
let home: string;
let piAgentDir: string;
let repo: string;

function write(file: string, frontmatter: string, body = "Prompt body.") {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
}

function discover(cwd = repo, scope: AgentScope = "both") {
	return discoverAgentsIn({ cwd, homeDir: home, piAgentDir }, scope);
}

function byName(cwd = repo, scope: AgentScope = "both") {
	return Object.fromEntries(discover(cwd, scope).agents.map((a) => [a.name, a]));
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "dotagents-subagent-"));
	home = path.join(root, "home");
	piAgentDir = path.join(home, ".pi", "agent");
	repo = path.join(root, "work", "repo");
	fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("layouts and names", () => {
	test("reads the dotagents layout <name>/agent.md", () => {
		write(path.join(repo, ".agents/agents/code-reviewer/agent.md"), "name: code-reviewer\ndescription: Reviews code");
		const agent = byName()["code-reviewer"];
		expect(agent?.source).toBe("project");
		expect(agent?.systemPrompt.trim()).toBe("Prompt body.");
	});

	test("reads the flat layout <name>.md", () => {
		write(path.join(repo, ".agents/agents/scout.md"), "name: scout\ndescription: Recon");
		expect(Object.keys(byName())).toEqual(["scout"]);
	});

	test("takes the name from id, then name, then the folder or file name", () => {
		write(path.join(repo, ".agents/agents/a/agent.md"), "id: by-id\nname: Display Name\ndescription: d");
		write(path.join(repo, ".agents/agents/b/agent.md"), "name: by-name\ndescription: d");
		write(path.join(repo, ".agents/agents/by-folder/agent.md"), "description: d");
		write(path.join(repo, ".agents/agents/by-file.md"), "description: d");
		expect(Object.keys(byName()).sort()).toEqual(["by-file", "by-folder", "by-id", "by-name"]);
	});

	test("skips disabled agents, agents without description and invalid files", () => {
		write(path.join(repo, ".agents/agents/off/agent.md"), "name: off\ndescription: d\nenabled: false");
		write(path.join(repo, ".agents/agents/nodesc/agent.md"), "name: nodesc");
		write(path.join(repo, ".agents/agents/broken/agent.md"), "name: [unclosed\ndescription: d");
		write(path.join(repo, ".agents/agents/ok/agent.md"), "name: ok\ndescription: d\nenabled: true");
		fs.mkdirSync(path.join(repo, ".agents/agents/empty-folder"));
		expect(Object.keys(byName())).toEqual(["ok"]);
	});
});

describe("Claude Code compatibility", () => {
	test("ignores Claude Code model aliases and keeps other model names", () => {
		write(path.join(repo, ".agents/agents/a/agent.md"), "name: a\ndescription: d\nmodel: opus");
		write(path.join(repo, ".agents/agents/b/agent.md"), "name: b\ndescription: d\nmodel: inherit");
		write(path.join(repo, ".agents/agents/c/agent.md"), "name: c\ndescription: d\nmodel: openrouter/deepseek/deepseek-v4");
		const agents = byName();
		expect(agents.a?.model).toBeUndefined();
		expect(agents.b?.model).toBeUndefined();
		expect(agents.c?.model).toBe("openrouter/deepseek/deepseek-v4");
	});

	test("maps Claude Code tool names to pi tool names", () => {
		write(path.join(repo, ".agents/agents/a/agent.md"), "name: a\ndescription: d\ntools: Read, Edit, MultiEdit, Glob, LS, Bash, WebFetch");
		write(path.join(repo, ".agents/agents/b/agent.md"), "name: b\ndescription: d\ntools: [read, grep]");
		const agents = byName();
		expect(agents.a?.tools).toEqual(["read", "edit", "find", "ls", "bash", "WebFetch"]);
		expect(agents.b?.tools).toEqual(["read", "grep"]);
	});
});

describe("directories and precedence", () => {
	test("later directories override earlier ones", () => {
		write(path.join(piAgentDir, "agents/shared.md"), "name: shared\ndescription: pi user");
		write(path.join(home, ".agents/agents/shared/agent.md"), "name: shared\ndescription: dotagents global");
		expect(byName().shared?.description).toBe("dotagents global");

		write(path.join(repo, ".pi/agents/shared.md"), "name: shared\ndescription: pi project");
		expect(byName().shared?.description).toBe("pi project");

		write(path.join(repo, ".agents/agents/shared/agent.md"), "name: shared\ndescription: dotagents workspace");
		const result = discover();
		expect(result.agents.map((a) => a.description)).toEqual(["dotagents workspace"]);
		expect(result.projectAgentsDir).toBe(path.join(repo, ".agents/agents"));
	});

	test("finds .agents/agents from a subdirectory of the repository", () => {
		write(path.join(repo, ".agents/agents/a/agent.md"), "name: a\ndescription: d");
		const sub = path.join(repo, "projects/x/src");
		fs.mkdirSync(sub, { recursive: true });
		expect(Object.keys(byName(sub))).toEqual(["a"]);
	});

	test("does not search .agents/agents above the repository root", () => {
		write(path.join(root, "work/.agents/agents/outside/agent.md"), "name: outside\ndescription: d");
		expect(byName()).toEqual({});
	});

	test("outside a repository, does not count the global layer as project agents", () => {
		write(path.join(home, ".agents/agents/g/agent.md"), "name: g\ndescription: d");
		const dir = path.join(home, "scratch");
		fs.mkdirSync(dir, { recursive: true });
		const result = discover(dir);
		expect(result.agents.map((a) => `${a.name}:${a.source}`)).toEqual(["g:user"]);
		expect(result.projectAgentsDir).toBeNull();
	});

	test("agentScope selects user or project agents", () => {
		write(path.join(home, ".agents/agents/u/agent.md"), "name: u\ndescription: d");
		write(path.join(repo, ".agents/agents/p/agent.md"), "name: p\ndescription: d");
		expect(Object.keys(byName(repo, "user"))).toEqual(["u"]);
		expect(Object.keys(byName(repo, "project"))).toEqual(["p"]);
		expect(Object.keys(byName(repo, "both")).sort()).toEqual(["p", "u"]);
	});

	test("follows symbolic links to agent folders and files", () => {
		write(path.join(root, "store/linked-dir/agent.md"), "name: linked-dir\ndescription: d");
		write(path.join(root, "store/linked-file.md"), "name: linked-file\ndescription: d");
		fs.mkdirSync(path.join(repo, ".agents/agents"), { recursive: true });
		fs.symlinkSync(path.join(root, "store/linked-dir"), path.join(repo, ".agents/agents/linked-dir"));
		fs.symlinkSync(path.join(root, "store/linked-file.md"), path.join(repo, ".agents/agents/linked-file.md"));
		expect(Object.keys(byName()).sort()).toEqual(["linked-dir", "linked-file"]);
	});
});
