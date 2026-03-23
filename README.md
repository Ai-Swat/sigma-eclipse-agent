<div align="center">

<img src="apps/electron-desktop/assets/icon.png" alt="Sigma Eclipse   " width="128">

# Sigma Eclipse

### Your personal AI assistant — right on your desktop.

Download. Install. Done. No terminal, no Homebrew, no dependencies to manage.

One app. All your AI models. All your tools. All your messengers. Batteries included.

[![npm version](https://img.shields.io/npm/v/openclaw?style=flat-square&color=cb3837)](https://www.npmjs.com/package/openclaw)
[![CI](https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/openclaw/openclaw/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/openclaw/openclaw?style=flat-square)](https://github.com/openclaw/openclaw/blob/main/LICENSE)

**[Get Sigma Eclipse](https://www.sigmabrowser.com/local-ai-chat)** · **[Download for macOS](https://github.com/Ai-Swat/sigma-eclipse-agent/releases/latest)** · **[Download for Windows](https://github.com/Ai-Swat/sigma-eclipse-agent/releases/latest)**

[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Ai-Swat/sigma-eclipse-agent/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://github.com/Ai-Swat/sigma-eclipse-agent/releases/latest)

</div>

---

## What is Sigma Eclipse?

Sigma Eclipse is the easiest way to run a personal AI assistant. It's a native desktop app — not a CLI tool, not a Docker container, not a browser extension. Download the installer, open it, and you're ready to go. No terminal. No Homebrew. No `npm install`. Everything you need is bundled inside.

It connects the best AI models to the tools and messengers you already use — without switching tabs, copying text, or juggling multiple apps. Pick your AI provider, and start chatting. Sigma Eclipse handles the rest: it reads your messages across Telegram, Slack, Discord, and more — and replies for you with the power of Claude, GPT, Gemini, or any model you choose.

## Why Sigma Eclipse?

| Problem                                        | Sigma Eclipse                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CLI tools need terminal, Homebrew, Node.js     | **Just download and run** — everything is bundled, zero dependencies                      |
| Switching between ChatGPT, Claude, Gemini tabs | **One app, all models** — switch with a click                                             |
| Copy-pasting AI answers into messengers        | **Auto-replies** across Telegram, Slack, Discord, and more                                |
| No access to your files, notes, calendar       | **Built-in skills** — Google Workspace, Notion, GitHub, Obsidian, Apple Notes & Reminders |
| Voice input requires extra tools               | **Built-in Whisper** — hold a button and talk, locally or via API                         |
| AI can't run commands on your machine          | **Embedded terminal** with exec approval — AI runs commands, you stay in control          |

## Features

### Chat with any AI model

Use the best model for the task. Switch providers and models on the fly.

- **Anthropic** — Claude 4.6 / Opus / Sonnet / Haiku
- **OpenAI** — GPT-5.2 etc
- **Google** — Gemini 2.5 Pro / Flash
- **xAI** — Grok
- **OpenRouter** — 200+ models in one place
- **NVIDIA NIM**, **Venice AI**, **MiniMax**, **Moonshot**, **Kimi Coding**, **Z.ai** and more

Bring your own API key or use a managed subscription — your choice.

### Talk to your AI

Hold the microphone button and speak. Sigma Eclipse transcribes your voice using **Whisper** — either locally (no data leaves your machine) or via the OpenAI Whisper API for maximum accuracy. Three local model sizes: Small, Medium, Large.

### Connect your messengers

Receive and reply to messages across your favorite platforms — all through one AI-powered interface.

- **Telegram** — bot token setup in seconds
- **Slack** — Socket Mode, no public endpoint needed
- **Discord** · **WhatsApp** · **Signal** · **iMessage** · **Matrix** · **Microsoft Teams** — coming soon

### Skills & integrations

Sigma Eclipsedoesn't just chat — it _does things_. Enable skills to give your AI superpowers:

| Skill                | What it does                                      |
| -------------------- | ------------------------------------------------- |
| **Google Workspace** | Read & draft emails, check calendar, manage inbox |
| **Notion**           | Search pages, query databases, create content     |
| **GitHub**           | Browse PRs, issues, create workflows              |
| **Obsidian**         | Search your vaults, read and write notes          |
| **Trello**           | Manage boards, cards, and lists                   |
| **Apple Notes**      | Create and search notes (macOS)                   |
| **Apple Reminders**  | Add and manage reminders (macOS)                  |
| **Web Search**       | Search the web with advanced queries              |
| **Media Analysis**   | Understand images, audio, and video               |
| **ElevenLabs**       | Generate natural speech                           |
| **Image Generation** | Create images from text prompts                   |
| **Custom Skills**    | Upload your own skill packages                    |

### Embedded terminal

A full terminal lives inside Sigma Eclipse. Your AI can suggest and run shell commands — with your explicit approval every time. Allow once, always allow, or deny. You stay in control.

### Smart exec approval

When the AI wants to run a command, you see exactly what it plans to do. One click to approve, deny, or auto-approve that command pattern. Security by default, convenience by choice.

### Auto-updates

Sigma Eclipse keeps itself up to date. New version available? A banner appears, you click download, and restart when ready. Release notes included.

### Backup & restore

Export your entire configuration as a ZIP snapshot. Restore it on a new machine or after a reset — all your settings, keys, and skills come back instantly.

## Getting started

No terminal required. No package managers. No config files. Just three steps:

1. **Download** Sigma Eclipse from [sigmabrowser.com](https://www.sigmabrowser.com) — one file, nothing else to install
2. **Open** — drag to Applications (macOS) or run the installer (Windows). All runtimes are bundled
3. **Pick your AI and go** — choose a provider, enter your API key, start chatting

Want to connect messengers or enable skills? The app walks you through it with a built-in setup wizard.

## Platforms

| Platform | Architecture          | Format                  |
| -------- | --------------------- | ----------------------- |
| macOS    | Apple Silicon (arm64) | `.dmg`                  |
| Windows  | x64                   | `.exe` (NSIS installer) |

## Built with

| Component | Technology                             |
| --------- | -------------------------------------- |
| Shell     | Electron                               |
| UI        | React, Redux Toolkit, React Router     |
| Build     | Vite, TypeScript, esbuild              |
| Terminal  | xterm.js, node-pty                     |
| Voice     | Whisper (local + API)                  |
| Markdown  | react-markdown, KaTeX (math rendering) |
| Updates   | electron-updater                       |

## Links

- **Website** — [sigmabrowser.com](https://www.sigmabrowser.com/local-ai-chat)
- **Releases** — [GitHub Releases](https://github.com/Ai-Swat/sigma-eclipse-agent/releases)
- **Support** — [GitHub Issues](https://github.com/openclaw/openclaw/issues)

## Open source foundation

Sigma Eclipse is built on top of [OpenClaw](https://github.com/openclaw/openclaw) — an open-source personal AI assistant platform licensed under **MIT**. OpenClaw provides the gateway, agent runtime, channel integrations, and skills engine that power Sigma Eclipse under the hood.

## License

- **OpenClaw** (core engine) — [MIT License](https://github.com/openclaw/openclaw/blob/main/LICENSE)
- **Sigma Eclipse** (desktop app) — [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
