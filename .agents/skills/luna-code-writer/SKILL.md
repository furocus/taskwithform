---
name: luna-code-writer
description: Delegate source-code implementation and test-writing to a GPT-6.1 Luna subagent at xhigh reasoning effort when available. Use for application code, behavior-controlling configuration, migrations, and automated tests. The parent continues when delegation is unavailable. Exclude read-only investigation, planning, reviews, documentation-only edits, and Git-only work.
---

# Luna Code Writer

Use Luna as the primary code writer when available. The parent owns scope, review, validation, and communication. Skill use does not grant permission to change unrelated files, operate Docker, commit, push, or write to external services.

## Workflow

1. Read applicable AGENTS and personal instructions; inspect enough context to bound the task. Exclude unrelated dirty-worktree files.
2. If supported, spawn with `model: "gpt-6.1-luna"`, `reasoning_effort: "xhigh"`, and `fork_turns: "none"`. Give the repository path, outcome, editable scope, relevant entry points, checks, constraints, and the instruction to read applicable AGENTS before editing.
3. Avoid overlapping edits while the child writes. The parent may investigate or prepare validation outside those files.
4. Review the actual diff, request focused corrections where needed, and run checks proportional to the change. Do not treat a child's completion report as review or proof that tests passed.
5. Report changes, actual checks, and unresolved limitations.

## Unavailable delegation

- If the specified model, reasoning effort, or subagent capability is unavailable, or no agent slot can be obtained, briefly report the limitation and continue implementation in the parent with the same scope and checks. Do not repeatedly retry an unsupported configuration or silently select another model.
- An idle suitable Luna writer may be reused. If a child has started, inspect its actual changes and ensure it is no longer editing before the parent takes over.
- A permission rejection or missing user decision is not a model-availability failure. Parent fallback must not bypass that restriction; continue only the independent authorized work.

## Boundaries

- Delegate source code, migrations, behavior-controlling configuration, and automated tests. Documentation-only and Git-only tasks stay with the parent.
- Use one writer per cohesive change. Additional writers are only for independent, non-overlapping areas.
- Preserve existing user changes. Neither parent nor child receives authorization for commits, pushes, PR changes, destructive actions, or external writes merely from this skill.
