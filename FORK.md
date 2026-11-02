# Fork Information

This package is a fork of the `subagent` example extension of pi.

## Base

| Item | Value |
|---|---|
| Package | `@earendil-works/pi-coding-agent` |
| Version | 1.1.0 |
| Path | `examples/extensions/subagent/` |
| Repository | https://github.com/earendil-works/pi |
| License | MIT, Copyright (c) 2025 Mario Zechner |

SHA-256 of the base files:

| File | SHA-256 |
|---|---|
| `index.ts` | `4facaa61c9c781748dd000eb5d2ec0a75289986d1a6e11ce13971ca5653dc252` |
| `agents.ts` | `cc85ecd33b89aa575bea3d2a9a9da7654a6305da4de02e5041aa5342a1de29b4` |

The sample agents and prompts in `examples/` come from the same base. The agents are in the dotagents layout (`<name>/agent.md`). Their content is not changed.

## Changes

1. `agents.ts`: agent discovery.
   - Reads `~/.agents/agents` and `.agents/agents` (dotagents layout) in addition to `~/.pi/agent/agents` and `.pi/agents`.
   - Reads `<name>/agent.md` and `<name>.md` in each directory.
   - Searches `.agents/agents` from the working directory up to the repository root.
   - Takes the agent name from `id`, then `name`, then the folder or file name. `description` is the only required field.
   - Skips agents with `enabled: false`.
   - Ignores Claude Code model aliases (`opus`, `sonnet`, `haiku`, `fable`, `opusplan`, `inherit`).
   - Maps Claude Code tool names to pi tool names.
   - Skips files with invalid frontmatter instead of stopping the discovery.
   - `discoverAgentsIn()` accepts the user directories, for tests.
2. `index.ts`: the default `agentScope` is `both` in trusted projects and `user` in other projects. The tool description names the new directories.

## Merge Upstream Changes

1. Find the version of the upstream example to merge.
2. Compare the base files above with the new upstream files:

   ```sh
   SRC="$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/subagent"
   diff -u <base index.ts> "$SRC/index.ts"
   ```

3. Apply the upstream changes to `extensions/subagent/`. Keep the changes in the list above.
4. Run `bun run typecheck` and `bun test`.
5. Update the version and the hashes in this file.
