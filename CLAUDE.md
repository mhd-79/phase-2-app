# Claude Code — project context

## Project: Okuto Mart POS & Billing System (Phase 2)

A full-stack Indian retail Point-of-Sale, billing, vendor, and inventory management application. Building upon core POS capabilities (offline-first PWA, GST calculations, returns, held bills, Z-reports, shift scheduling), Phase 2 adds comprehensive vendor management, purchase orders (PO) and goods receipt notes (GRN), purchase returns, batch & expiry tracking, advanced stock control (adjustments, physical audits, bulk upload, reorder alerts), discount/promotions engine, and AI insights.

---

## PERMANENT PROJECT RULES

1. **PROJECT REFERENCE** — Use the provided SRS document and `phase-2-prototype.zip` as primary references. Follow the existing prototype's UI, UX, screens, navigation, workflows, styling, components, and terminology. Do not invent new workflows when an existing prototype workflow already exists.

2. **SURGICAL CHANGES ONLY** — Make only the changes explicitly requested. Do NOT redesign, remove functionality, rename existing screens/buttons/routes/variables/APIs/tables/components unless explicitly asked. Do NOT modify unrelated files. Preserve all working features. Identify exactly which files are relevant and modify only those.

3. **TECH STACK — DO NOT CHANGE**
   - **Frontend:** Angular 22, TypeScript, Angular Material, Tailwind CSS, Angular CDK Layout, PWA
   - **Backend:** Python 3.12+, FastAPI, Pydantic v2, Prisma ORM, Alembic
   - **Database:** PostgreSQL 16+, Neon DB
   - **Cloud/Deploy:** Microsoft Azure, Railway, GitHub Actions / Azure DevOps CI/CD

---


<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-09-14T05:11:42.714Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace (auto-overwritten on each scan). Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user’s task matches a server** (e.g. Confluence work and a **Confluence** / **Atlassian** MCP is listed), **prefer that server id** and plan on tool use—not only file search.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP

- `c:\Yunus\Internship\Billing Software\Phase 2 app\.mcp.json` _(workspace: Phase 2 app)_ — _file missing_

_No active workspace servers in mcp.json._

#### User MCP

- `C:\Users\Asus\.claude.json` — _no servers defined_

_No active user-scoped servers in mcp.json._

#### Project skills

_None found (or no workspace open)._

#### User skills

- **developing-with-streamlit** — `C:\Users\Asus\.agents\skills\developing-with-streamlit` — Use for ALL Streamlit tasks: creating, editing, debugging, beautifying, styling, theming, optimizing, or deploying Streamlit apps. Also custom components, st.components.v2, HTML/JS/CSS work. Discovers and loads version-m

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->

# XML Tags for Prompts: Quick Reference

> **Key fact:** Claude has no reserved or "magic" tag names. It was trained to pay close attention to XML-style structure, so any clear, descriptive name works. What matters is that you **pick a name, use it consistently, and refer to it by name** (for example, "Check your work against `<acceptance_criteria>`").

---

## 1. Role & Context: *who and where*

| Tag | Purpose |
|---|---|
| `<role>` | Persona or expertise the model should take on (e.g. "Senior Angular + FastAPI engineer"). |
| `<context>` | Background: app type, goal, business situation. |
| `<background>` | Longer history or why this work is happening. |
| `<tech_stack>` | Frameworks, versions, DB, hosting (e.g. Angular 22, FastAPI, Prisma, Azure SQL). |
| `<project_structure>` | Folder layout and key files, so the model knows where things live. |
| `<audience>` | Who reads the output (developer, client, end user, management). |
| `<glossary>` | Domain terms and abbreviations (GRN, QC, BOM, RBAC roles). |

## 2. Task Definition: *what to do*

| Tag | Purpose |
|---|---|
| `<task>` | The single main request, in one or two sentences. |
| `<goal>` / `<objective>` | The outcome you want, as opposed to the individual steps. |
| `<changes>` | Checklist of fixes or changes (what you used for the QC module). |
| `<requirements>` | Functional requirements for new features. |
| `<user_story>` | "As a <role>, I want… so that…" |
| `<scope>` | What is included. |
| `<out_of_scope>` | What must **not** be touched. Prevents over-engineering. |

## 3. Inputs & Evidence: *what to look at*

| Tag | Purpose |
|---|---|
| `<documents>` → `<document index="1">` | Wrapper for several pasted docs; nest `<source>` and `<document_content>` inside. |
| `<code>` / `<file path="...">` | Pasted source code. Put the path in an attribute. |
| `<error>` / `<stack_trace>` | Exact error text. |
| `<logs>` | Server, browser console or network logs. |
| `<current_behavior>` | What happens now (the bug). |
| `<expected_behavior>` | What should happen. |
| `<steps_to_reproduce>` | Numbered repro steps. |
| `<data>` / `<sample_data>` | JSON, CSV or table samples. |
| `<api_contract>` | Endpoints, request and response shapes, status codes. |
| `<db_schema>` | Prisma schema, tables, relations. |
| `<screenshots_description>` | Text description of UI screenshots you attach. |

## 4. Rules & Constraints: *how to behave*

| Tag | Purpose |
|---|---|
| `<instructions>` | Step-by-step working process (read code → plan → implement → verify). |
| `<constraints>` | Hard limits: "no new libraries", "don't change DELETE permissions". |
| `<coding_standards>` | Naming, linting, patterns (standalone components, signals, DTOs). |
| `<security>` | Auth, RBAC and data-exposure rules. |
| `<assumptions>` | Things the model may assume are true. |
| `<dependencies>` | Other modules or services affected by the change. |
| `<avoid>` / `<do_not>` | Known anti-patterns to steer away from. Stating the positive form in `<constraints>` usually works better. |

## 5. Quality & Verification: *how to know it's done*

| Tag | Purpose |
|---|---|
| `<acceptance_criteria>` | Testable pass/fail conditions (AC1, AC2…). |
| `<definition_of_done>` | Team-level done checklist (builds, tests, migration, docs). |
| `<test_cases>` | Specific scenarios with input → expected result. |
| `<verification>` | How to verify: login, URLs, commands to run. |
| `<test_environment>` | Base URL, test user **reference** (keep passwords in `.env`, not in the prompt). |
| `<regression_checks>` | Existing features that must keep working. |

## 6. Examples: *show, don't tell*

| Tag | Purpose |
|---|---|
| `<examples>` → `<example>` | Several sample inputs and outputs. 3–5 varied examples work best. |
| `<good_example>` / `<bad_example>` | Contrast pairs to show the quality bar. |
| `<input>` / `<output>` | Used inside `<example>` to separate the two sides. |

## 7. Output Specification: *what to hand back*

| Tag | Purpose |
|---|---|
| `<output_format>` | Structure of the response (full files, diff, table, JSON). |
| `<deliverables>` | Concrete list: files, migration, test report, docs. |
| `<template>` | Exact skeleton the answer must follow. |
| `<tone>` / `<style>` | Formal, concise, client-facing, etc. |
| `<length>` | Word, line or section limits. |

## 8. Tags to Ask the Model to Use in Its Answer

Tell the model: *"Put your plan in `<plan>` and the final code in `<code>` tags."* This makes the answer easy to parse or skim.

| Tag | Purpose |
|---|---|
| `<thinking>` / `<analysis>` | Reasoning before answering. |
| `<plan>` | Short plan before code. |
| `<answer>` / `<final_answer>` | The final result, separate from the reasoning. |
| `<summary>` | TL;DR. |
| `<findings>` / `<issues>` | Review or audit results. |
| `<risks>` | Side effects or regressions to watch. |
| `<questions>` | Clarifications needed before continuing. |
| `<verification_report>` | Pass/fail per acceptance criterion. |

## 9. Delivery & Ops (Coding/DevOps)

| Tag | Purpose |
|---|---|
| `<files_to_modify>` | Expected file list, which limits how widely the model changes things. |
| `<migration>` | DB migration requirements (nullable, default, backfill). |
| `<rollback_plan>` | How to undo if it breaks. |
| `<environment>` | dev/staging/prod details, env vars (names only). |
| `<commit_message>` | Required commit or PR message format. |

---

## Recommended Order in a Prompt

```
<role>                 who
<context>              where / why
<tech_stack>
<documents> / <code>   long inputs go near the TOP
<task> / <changes>     what
<constraints>          limits
<acceptance_criteria>  done =
<examples>             optional
<instructions>         how to work
<output_format>        what to return   ← the ask goes LAST
```

Long material (docs, code, logs) works best **above** the question. Instructions and output format work best **at the end**.

---

## Ready-to-Copy Template

```xml
<role>Senior full-stack engineer (Angular 22 + FastAPI/Prisma).</role>

<context>
App: ...
Goal: ...
</context>

<changes>
### 1. Area
* [ ] ...
</changes>

<constraints>
- Do not change: ...
- No new dependencies.
</constraints>

<acceptance_criteria>
- AC1: ...
- AC2: ...
- AC-Reg: Existing <feature> works unchanged; build passes.
</acceptance_criteria>

<instructions>
1. Read the current code first.
2. Put a short plan in <plan> tags before writing code.
3. Send full updated files, not snippets.
4. Verify each AC and report pass/fail in <verification_report>.
</instructions>

<output_format>
<plan>, then each file in its own code block with its path, then <verification_report>.
</output_format>
```

---

## Using Tags in `.md` Files (CLAUDE.md, prompt libraries, specs)

- **Tags work fine inside Markdown.** Headings (`##`) organize the file for people, and XML tags mark exact boundaries for the model. Use both.
- In **CLAUDE.md**, wrap stable rules: `<coding_standards>`, `<project_structure>`, `<commands>` (build/test/lint), `<constraints>`.
- To **show** a tag as documentation, put it inside a code fence (as in this file). Raw tags outside fences are read as real structure.
- Some Markdown previewers hide raw `<tags>`. The model still sees them.

## Best Practices

1. **Be consistent.** Use the same name for the same thing across prompts. Don't switch between `<criteria>` and `<acceptance_criteria>`.
2. **Use snake_case** with descriptive names: `<acceptance_criteria>` rather than `<ac>`.
3. **Nest for hierarchy:** `<documents><document index="1"><source>…</source></document></documents>`.
4. **Use attributes for metadata:** `<file path="src/app/qc/qc.component.ts">`.
5. **Refer to tags by name** in instructions ("using `<db_schema>`…").
6. **Don't over-tag.** A three-line prompt doesn't need tags. Use them once you have several distinct parts.
7. **Keep secrets out.** Refer to `.env` variables by name, and never paste passwords or keys.
8. **Close every tag.** An unclosed tag blurs where a section ends.
