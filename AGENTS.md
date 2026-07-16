# T3 Company OS Development Guide

## Project Purpose

T3 Company OS is an operating system for group-buying companies.

This project is not a web version of Notion. It is a system that automates real operational work for the company.

The product should help teams reduce repetitive work, connect fragmented operational data, and make campaign-centered decisions faster.

## Development Principles

- Keep the current stack: React + TypeScript + Vite.
- Do not delete the existing project structure.
- Do not fully rewrite existing screens.
- Modify only the parts required for the task.
- Build new flows with mock data first.
- Connect the database only after the UI and workflow are validated.
- Prefer small, focused changes over broad refactors.
- Preserve existing behavior unless the task explicitly requires a change.

## Project Structure

The product is organized around these major areas:

- Dashboard
- My Work
- Campaign
- Campaign Detail
- CS
- Sample
- Sales Data
- Settlement
- Payment
- AI Assistant

All data should connect around `Campaign`.

Campaign is the core entity. CS, samples, sales data, settlement, payment, AI recommendations, and task workflows should all be traceable back to a campaign whenever possible.

## UI Principles

- Use an Apple-inspired visual direction.
- Prefer white cards.
- Use a bright gray page background.
- Keep generous spacing.
- Prioritize information clarity over decoration.
- Make layouts responsive.
- Keep interfaces calm, readable, and work-focused.
- Use consistent card spacing, typography, and hierarchy across screens.

## Coding Rules

- Use React Function Components.
- Use TypeScript.
- Split UI into components.
- Keep service logic in a separate service layer.
- Keep mock data separate from components.
- Keep utilities separate from components and services.
- Avoid mixing data fetching, business logic, and rendering in one file when the feature grows.
- Name files and functions according to their domain role.

## AI Principles

- AI does not replace human judgment.
- AI removes repetitive work.
- AI recommends work.
- AI classifies CS.
- AI reviews settlement.
- AI should support operators by surfacing context, risks, and next actions.

## Completion Rules

Work is complete only after all of the following steps are done:

1. `npm run build`
2. Fix all build errors.
3. `git status`
4. `git add .`
5. `git commit`
6. `git push`

If any step fails, fix the issue and repeat the required steps until the build passes and the changes are pushed.

## Commit Rules

Use Conventional Commit messages.

Allowed commit prefixes:

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `style:`
- `test:`

Commit messages should be short, clear, and written in the form:

```text
type: summary
```

Examples:

```text
feat: add campaign detail summary
fix: correct settlement total calculation
docs: add AGENTS instructions
```

## Response Rules

After finishing work, always explain:

- Changed files
- Build result
- Commit hash
- Push result
- Recommended next work
