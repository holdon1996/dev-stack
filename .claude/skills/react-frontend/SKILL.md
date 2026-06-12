---
name: react-frontend
description: React-focused frontend guidance for component architecture, state flow, rendering boundaries, and maintainable UI systems. Use for plain React apps that are not specifically Next.js-first.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# React Frontend

This skill is the React-first counterpart to `nextjs-react-expert`.

Use it when the project uses React without needing Next.js-specific assumptions such as SSR, App Router, or server components.

## Guidance

- Prefer the existing project architecture over introducing a new pattern.
- Keep state ownership shallow and explicit.
- Separate presentational UI from data-fetching and side effects when it improves maintainability.
- Optimize rendering only after confirming an actual bottleneck.
- Pair with `frontend-design` for UI/UX decisions.

## Related Skills

- `nextjs-react-expert` for Next.js-specific performance and routing concerns
- `frontend-design` for layout, visual hierarchy, and responsive design
- `clean-code` for naming, file boundaries, and readability
