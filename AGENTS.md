# AGENTS.md

Shared operating instructions for Codex, Antigravity, Claude Code, and Cursor.

## Startup

1. Read this file first.
2. Read `.agent/docs/project.md` for detected stack, commands, and routing.
3. Read `.agent/docs/workflow.md` for the task flow before editing.
4. Read `.agent/docs/architecture.md` and `.agent/docs/conventions.md` before planning code changes.
5. Read `.agent/docs/tooling.md` when the task needs Playwright, codegraph, MCP, or native Codex/Claude skill setup.
6. Select and load only the agent, skill, or workflow files that match the current task.

If any `.agent/docs/*.md` file still contains `TODO: refine`, update the docs by scanning the project before making product code changes.

## Task Flow

- Questions and analysis: answer directly, cite relevant files when useful, and do not edit code.
- Simple fix: inspect dependencies, make the smallest change, run focused verification.
- Feature or refactor: define success criteria, make a short plan, implement, then verify.
- Multi-domain work: use `.agent/workflows/orchestrate.md` and route to the relevant specialist docs.
- UI work: read `.agent/agents/frontend-specialist.md` and applicable design skills before editing.

## Skill Loading

- Treat `.agent/skills/` as the shared source of truth for all kit skills.
- Codex exposes skills from `~/.codex/skills/` in the `$` menu; `thachvd-kit` copies selected skills there on init.
- Claude Code project skills live in `.claude/skills/`.
- If a skill is missing from the global dir, fall back to the matching `.agent/skills/<skill>/SKILL.md` file.
- Do not load skill bodies by default; load a skill only when the user mentions it, the task clearly matches its description, or `.agent/docs/project.md` routes the task to it.
- Prefer explicit skill mentions for predictable behavior: `$clean-code`, `$systematic-debugging`, `$webapp-testing`, or any skill listed in `.agent/docs/project.md`.
- Run `thachvd-kit --help` to see common workflow and skill recommendations.
- When creating or improving skills, use `writing-skills` first and make the `description` field specific enough for implicit invocation.

## Rules

- Respond in the user's language; keep code, identifiers, and code comments in English.
- This is a Windows-first desktop application; ensure code does not assume Unix environments and uses PowerShell (`.ps1`) for scripts.
- The React UI features localization. Update both translation keys in `src/i18n.js` (`en` and `vi`) when modifying or adding UI labels.
- State assumptions when the request is ambiguous.
- Prefer the existing project style over new abstractions.
- Keep changes surgical and remove only dead code introduced by your change.
- Tests or equivalent verification are mandatory before claiming done.
- Keep files under 300 lines unless the project already has a different standard in `.agent/docs/conventions.md`.

## Shared Knowledge

- Project docs: `.agent/docs/`
- Specialist agents: `.agent/agents/`
- Skills: `.agent/skills/`
- Codex global skills: `~/.codex/skills/` (installed by thachvd-kit init)
- Claude Code project skills: `.claude/skills/`
- Workflows: `.agent/workflows/`
- Tooling setup: `.agent/docs/tooling.md`
- Antigravity mirror rules: `.agent/rules/GEMINI.md`
- Cursor entry rules: `.cursorrules`
