# pi-dotagents-subagent

A [pi](https://github.com/earendil-works/pi) extension that delegates tasks to subagents. Each subagent runs in a separate `pi` process with an isolated context window.

This package is a fork of the `subagent` example extension of pi (see [FORK.md](FORK.md)). It adds:

- Agents in the [dotagents](https://dotagentsprotocol.com/) layout: `.agents/agents/<name>/agent.md`.
- Agent files that are shared with Claude Code (for example through a `.claude/agents -> ../.agents/agents` link).
- Project agents by default in trusted projects.

## Installation

```sh
# From a local checkout
pi install /path/to/pi-dotagents-subagent

# Only for the current project (writes .pi/settings.json)
pi install -l /path/to/pi-dotagents-subagent
```

Do not install this package together with the upstream `subagent` example. The two extensions register the same `subagent` tool.

## Agent Files

An agent is a Markdown file with YAML frontmatter. The body is the system prompt of the agent.

```markdown
---
name: code-reviewer
description: Reviews code changes for bugs and missing tests
tools: read, grep, find, ls, bash
model: anthropic/claude-sonnet-5-5
---

You are a critical code reviewer. ...
```

| Field | Required | Meaning |
|---|---|---|
| `description` | yes | When to use the agent. |
| `id` | no | Name of the agent (dotagents). Has priority over `name`. |
| `name` | no | Name of the agent. Default: the folder name (`<name>/agent.md`) or the file name (`<name>.md`). |
| `enabled` | no | `false` disables the agent. |
| `tools` | no | Tool allowlist, as a list or a comma-separated string. Default: the default pi tools. |
| `model` | no | pi model. Default: the model and the thinking level of the parent session. |

Other fields, for example the dotagents fields `role` and `connection-type` or the Claude Code fields `color` and `memory`, have no effect. The extension does not read the dotagents `config.json`.

### Files Shared With Claude Code

One agent file can serve pi and Claude Code:

- Claude Code model aliases (`opus`, `sonnet`, `haiku`, `fable`, `opusplan`, `inherit`) do not name a pi model. The extension ignores them, and the agent uses the model of the parent session.
- Claude Code tool names are mapped to pi tool names: `Read` → `read`, `Write` → `write`, `Edit` and `MultiEdit` → `edit`, `Bash` → `bash`, `Grep` → `grep`, `Glob` → `find`, `LS` → `ls`. Other names stay as they are. pi ignores names that match no tool.

## Directories

The extension reads these directories. When two agents have the same name, the later directory wins.

| # | Directory | Scope | Search |
|---|---|---|---|
| 1 | `~/.pi/agent/agents` | user | fixed path (`PI_CODING_AGENT_DIR` changes it) |
| 2 | `~/.agents/agents` | user | fixed path (dotagents global layer) |
| 3 | `.pi/agents` | project | nearest ancestor of the working directory |
| 4 | `.agents/agents` | project | nearest ancestor of the working directory, up to the repository root |

Each directory can hold agents in two layouts:

```text
.agents/agents/
├── code-reviewer/
│   └── agent.md      # dotagents layout
└── scout.md          # flat layout (upstream pi, Claude Code)
```

The extension reads the directories again for each call, so changes take effect immediately.

## Security Model

Project agents are prompts that the repository controls. They can tell the model to read files and run commands.

- In a trusted project, the default `agentScope` is `both`: user agents and project agents.
- In other projects, the default `agentScope` is `user`. The model can set `agentScope: "both"` or `"project"`. In interactive mode, the tool then asks for a confirmation before it runs project agents. `confirmProjectAgents: false` disables the confirmation.

## Usage

```text
Use scout to find all authentication code
Run 2 scouts in parallel: one to find models, one to find providers
Use a chain: first have scout find the read tool, then have planner suggest improvements
```

| Mode | Parameter | Description |
|---|---|---|
| Single | `{ agent, task }` | One agent, one task |
| Parallel | `{ tasks: [...] }` | Many agents at the same time (max 8, 4 concurrent) |
| Chain | `{ chain: [...] }` | One after the other, with the `{previous}` placeholder |

The output display, the error handling and the limits are the same as in the upstream example (`examples/extensions/subagent/README.md` in the pi package).

## Examples

`examples/agents/` contains the sample agents of the upstream example (`scout`, `planner`, `reviewer`, `worker`) in the dotagents layout. `examples/prompts/` contains the workflow prompts (`/implement`, `/scout-and-plan`, `/implement-and-review`). The package does not load them. Copy or link them into an agent directory and into `.pi/prompts/` or `~/.pi/agent/prompts/`.

## Development

```sh
bun install
bun test
bun run typecheck
```
