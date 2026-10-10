<p align="center">
  <img src="assets/icon.png" width="120" height="120" alt="Modula Logo" />
</p>

<h1 align="center">Modula</h1>

<p align="center">
  <strong>Minimalist Canvas LMS module manager, offline downloader, and real-time auto-sync hub.</strong>
</p>

<p align="center">
  <a href="#downloads"><img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-000000?style=flat-square" alt="Platform"></a>
  <a href="#downloads"><img src="https://img.shields.io/badge/Release-v1.0.0-E13F2B?style=flat-square" alt="Release"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License"></a>
</p>

---

## ⚡ Overview

**Modula** is a distraction-free, high-performance desktop application designed for students. Connect your university Canvas LMS account with a single API token to browse, download, and automatically synchronize course modules, lecture slides, assignments, and study materials offline.

Built with a strict Swiss-inspired aesthetic: pure obsidian black, clean white, and the signature Canvas scarlet red.

---

## ✨ Features

- **Personal API Token Connection**: Seamlessly connects to any university Canvas instance (Birmingham, Oxford, Manchester, Canvas Free, or your custom domain).
- **Module Explorer**: View all modules, pages, files, assignments, quizzes, and resources structured exactly as they appear in Canvas.
- **Granular & Batch Downloads**:
  - 📥 **One-Click Course Download**: Download all modules and files across the entire semester with one click.
  - 📁 **Module Download**: Download an entire week's or topic's materials into a numbered, organized folder.
  - 📄 **Single-File Download**: Download specific slides, past papers, or templates manually.
- **Real-Time Auto-Sync & Delta Updates**:
  - Background polling (configurable from 5 min to 1 hr).
  - Detects when professors add new modules or upload updated lecture slides.
  - Displays a vibrant **NEW** badge and sends native desktop notifications.
  - Optional **"Auto-Download New Items"** switch to automatically save newly posted files to your computer.
- **Smart Page & Media Parsing**:
  - Canvas Pages are automatically converted into readable Markdown (`.md`) and standalone HTML.
  - Embedded images and file links referenced inside pages are extracted and saved automatically.
- **Minimalist Aesthetic & Themes**:
  - Pure, distraction-free typography.
  - Instant toggle between **Dark Mode** (system default) and **Light Mode**.
- **Cross-Platform**:
  - Native performance and look on **macOS** (DMG / Apple Silicon & Intel) and **Windows** (Installer & Portable EXE).

---

## 📥 Direct Downloads

Download the latest version of Modula for your operating system:

| Operating System | Download Link | Format | Architecture |
| :--- | :--- | :--- | :--- |
| **macOS** | [📥 **Download Modula for macOS (.dmg)**](https://github.com/MananDua28/Modula/releases/download/v1.0.3/Modula-1.0.3-arm64.dmg) | `.dmg` Package (114 MB) | Apple Silicon & Intel |
| **Windows (Setup)** | [📥 **Download Modula Setup Installer (.exe)**](https://github.com/MananDua28/Modula/releases/download/v1.0.3/Modula-Setup-1.0.3.exe) | `.exe` NSIS Installer (97.7 MB) | 64-bit x64 (Windows 10 / 11) |
| **Windows (Portable)** | [📥 **Download Modula Portable (.exe)**](https://github.com/MananDua28/Modula/releases/download/v1.0.3/Modula-Portable-1.0.3.exe) | `.exe` Standalone (97.4 MB) | 64-bit x64 (No install required) |
| **All Releases** | [View GitHub Releases Archive](https://github.com/MananDua28/Modula/releases) | `.zip`, `.exe`, `.dmg` | All Platforms |

> [!TIP]
> **Windows Defender SmartScreen & Installation:**  
> - **SmartScreen Bypass:** Click **More info** &rarr; **Run anyway**.  
> - **Installer Loop or "Missing Shortcut"?** If Windows Defender's real-time heuristic scanner flags the unzipped `.exe` during setup, simply download and run the **Standalone Portable Edition (`Modula-Portable.exe`)**—no installer wizard or AppData permissions needed! Alternatively, click **Restore / Allow on device** in Windows Security &rarr; Protection history.  
> - **100% Virus-Free:** Scanned clean on VirusTotal (0 / 72 security vendors detected 0 threats).

> [!TIP]
> **macOS Gatekeeper First-Time Launch:**  
> Since Modula is an independent student project built without an Apple Developer certificate ($99/yr), macOS may show *"Modula is damaged and can't be opened"* on your first launch.  
> Run this one-time command in your Terminal:
> ```bash
> xattr -cr /Applications/Modula.app
> ```
> Or right-click `Modula.app` in Finder and select **Open**.

---

## 🔑 How to Get Your Canvas API Access Token

1. Log in to your university Canvas account (e.g. `https://canvas.bham.ac.uk`).
2. Click your **Account** icon (profile picture) in the top-left sidebar.
3. Select **Settings**.
4. Scroll down to the **Approved Integrations** section.
5. Click **+ New Access Token**.
6. Enter a name (e.g. `Modula`) and click **Generate Token**.
7. Copy the generated token string and paste it into Modula's Settings modal.

---

## 📂 Local Directory Organization

Files downloaded with Modula are structured cleanly by default:

```
~/Downloads/Modula/
└── [Course Code] - [Course Name]/
    ├── 01_ABOUT YOUR MODULE/
    │   ├── Welcome to the Module.md
    │   └── Syllabus.pdf
    ├── 02_Week 1 - Introduction/
    │   ├── Lecture 1 - Slides.pdf
    │   └── Reading Notes.docx
    └── Assignments/
        ├── Preliminary Report.md
        └── Ethical Review.docx
```

---

## 🛠️ Development & Building from Source

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or higher)
- npm (v9 or higher)

### Setup

```bash
# Clone repository
git clone https://github.com/MananDua28/Canvas-Downloader.git
cd Canvas-Downloader

# Install dependencies
npm install

# Run application in development
npm start
```

### Build Distribution Binaries

```bash
# Build for macOS (.dmg and .zip)
npm run dist:mac

# Build for Windows (.exe installer and portable)
npm run dist:win

# Build all platforms
npm run dist:all
```

Binaries will be outputted to the `dist/` folder.

---

## 🎨 Design System

| Element | Dark Mode (Default) | Light Mode |
| :--- | :--- | :--- |
| **App Background** | `#09090b` (Deep Obsidian) | `#ffffff` (Pure White) |
| **Cards & Surfaces** | `#141418` | `#f8f8fa` |
| **Borders** | `#24242a` | `#e4e4e9` |
| **Accent & Highlight** | `#E13F2B` (Canvas Scarlet) | `#E13F2B` (Canvas Scarlet) |
| **Text Primary** | `#f4f4f6` | `#09090b` |
| **Text Muted** | `#8e8e99` | `#6b6b76` |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
