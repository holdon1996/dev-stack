---
name: desktop-design
description: Desktop and cross-platform app design guidance for Tauri and similar desktop shells. Use when building desktop-first interfaces, windowed workflows, keyboard-heavy UX, or cross-platform desktop UI behavior.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Desktop Design

This skill covers desktop-first product thinking where `mobile-design` is the wrong default.

Use it for Tauri and other desktop-oriented apps with window management, keyboard shortcuts, dense layouts, or multi-panel workflows.

## Guidance

- Design for pointer + keyboard, not touch-first.
- Use information density deliberately; desktop screens can support richer sidebars and multi-column layouts.
- Respect platform conventions for menus, shortcuts, dialogs, file pickers, and drag/drop.
- Assume resizing, multiple windows, and long-running sessions are normal.
- Pair with `rust-pro` for Tauri backend/native concerns and `frontend-design` for UI execution.

## Related Skills

- `mobile-design` for touch-first mobile products
- `frontend-design` for visual and interaction design
- `rust-pro` for Rust and Tauri implementation details
