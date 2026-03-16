# DevStack Tauri Implementation Plan

## Overview
Rebuilding the functionality of Laragon into a modern, lightweight, and blazing-fast background application using the Tauri v2 framework. 

## Technology Stack
- **Frontend**: React + TypeScript + Tailwind CSS + Zustand (State Management) + React Query
- **Backend (Core)**: Tauri (Rust payload) + `tauri-plugin-shell` (managing Nginx/PHP/MySQL processes) + `tauri-plugin-fs` (config generation)
- **Services**: Sidecar binaries downloaded in the background upon setup

## Decisions Based on User Input
1. **Elevated Privileges (Vhosts Editor)**: App runs normally without Administrator rights. It will only invoke a prompt for UAC when modifying `C:\Windows\System32\drivers\etc\hosts` (e.g., when the user creates a new site).
2. **Process Lifecycle**: When the user closes the main UI (clicks `[X]`), the application minimizes into the System Tray instead of terminating. The background services (Nginx, PHP, MySQL) continue to run. They will only be killed if the user explicitly chooses "Quit" from the tray menu.
3. **Binaries & Storage**: The core app will be as lightweight as possible. It will check if `Nginx, PHP, MySQL` exist in a predefined `~/.devstack/bin` (or `AppData`) directory. If not present, the app will download zip files according to the version chosen by the user and extract them transparently. It will then optionally inject their paths into the terminal Environments via background scripts.

## Milestones
- [x] Scaffold React + Tauri V2 App
- [x] Install Core Frontend Dependencies (Tailwind, Zustand, React Query)
- [ ] Configure `src-tauri` (tray icon, plugins, system setup)
- [ ] Implement UI from provided `index.html` as React components with Tailwind
- [ ] Implement Rust backend commands (downloading binaries, extracting, starting/stopping `Command` processes)
- [ ] Connect Frontend Zustand store to Rust backend status

