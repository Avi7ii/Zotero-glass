<div align="center">

<img src="zotero-glass-plugin/chrome/content/zotero-glass.svg" width="156" alt="Zotero Glass">

# Zotero Glass

### Native glass materials for Zotero on macOS
### Let Zotero feel at home on the Mac

<a href="README.md">
  <img src="https://img.shields.io/badge/简体中文-查看中文文档-dc2626?style=for-the-badge" alt="Chinese README">
</a>

<br><br>

[![Release](https://img.shields.io/github/v/release/Avi7ii/Zotero-glass?style=for-the-badge&color=6f5cff)](https://github.com/Avi7ii/Zotero-glass/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Avi7ii/Zotero-glass/total?style=for-the-badge&color=0ea5e9)](https://github.com/Avi7ii/Zotero-glass/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/Avi7ii/Zotero-glass/ci.yml?style=for-the-badge&label=Build)](https://github.com/Avi7ii/Zotero-glass/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Avi7ii/Zotero-glass?style=for-the-badge&color=f2c94c)](LICENSE)

[![macOS](https://img.shields.io/badge/macOS-native_glass-111111?style=flat-square&logo=apple)](https://www.apple.com/macos/)
[![Zotero](https://img.shields.io/badge/Zotero-9.x-CC2936?style=flat-square)](https://www.zotero.org/)
[![Theme](https://img.shields.io/badge/Theme-Dark_only-222222?style=flat-square)](#important)
[![Stars](https://img.shields.io/github/stars/Avi7ii/Zotero-glass?style=flat-square&color=ffb000)](https://github.com/Avi7ii/Zotero-glass/stargazers)
![Views](https://komarev.com/ghpvc/?username=Avi7ii&repo=Zotero-glass&label=Views&color=7c5cff&style=flat-square)

<br>

<img src="https://readme-typing-svg.demolab.com?font=SF+Pro+Display&weight=600&size=22&duration=3200&pause=900&color=7AAEFF&center=true&vCenter=true&width=760&lines=Native+NSVisualEffectView%2C+not+a+CSS+imitation.;Transparent.+Blurred.+Consistent.;A+native+macOS+surface+for+your+research+library." alt="Zotero Glass">

<br>

<a href="https://github.com/Avi7ii/Zotero-glass/releases/latest">
  <img src="https://img.shields.io/badge/Download-Latest_XPI-147EFB?style=for-the-badge&logo=github&logoColor=white" height="42" alt="Download latest XPI">
</a>

</div>

---

## Important

> **Zotero Glass is currently macOS-only and dark-theme-only.**
>
> Enabling the plugin automatically switches Zotero to dark mode. Its materials, tint masks, typography contrast, and sidebar transparency are deliberately tuned for a dark interface, where native glass looks more coherent, restrained, and premium. Windows, Linux, and Zotero's light theme are not supported by the current release.

---

## What is Zotero Glass?

Zotero Glass is a native-material plugin for Zotero on macOS. It calls AppKit directly from the Zotero plugin runtime and inserts a real `NSVisualEffectView` into Zotero windows instead of imitating glass with a translucent CSS color.

The complete runtime ships inside one XPI. No helper application, LaunchAgent, `userChrome.css`, or separately compiled dynamic library is required.

| CSS imitation | **Zotero Glass** |
| :--- | :--- |
| Changes opacity and color | **Uses native AppKit materials** |
| Clear transparency or a flat overlay | **Dynamic background sampling and blur** |
| Surfaces often look disconnected | **Coordinates library and reader surfaces** |
| Parameters are commonly hard-coded | **Live controls inside Zotero** |

---

## Preview

<p align="center">
  <img src="docs/assets/hero.png" width="94%" alt="Zotero Glass native dark glass preview">
</p>

<p align="center"><sub>Dark PDF reader, dual glass sidebars, and a translucent annotation popup</sub></p>

<p align="center">
  <img src="docs/assets/library.png" width="94%" alt="Zotero Glass library">
</p>

<p align="center">
  <img src="docs/assets/reader.png" width="94%" alt="Zotero Glass PDF reader">
</p>

> Journal rankings, impact factors, and reading-status columns in the screenshots are supplied by Ethereal Style/EasyScholar. Zotero Glass integrates their appearance but does not generate academic ranking data.

---

## Features

| Feature | Implementation |
| :--- | :--- |
| Native glass | Direct `NSVisualEffectView` and AppKit material bridge |
| Zotero library | A consistent hierarchy across title bar, toolbar, list, and sidebars |
| PDF reader | Unified thumbnail sidebar, metadata pane, and reader toolbar |
| Annotation popups | Readable dark translucent surfaces with background blur |
| Independent sidebars | Separate transparency, blur, tint, and material controls |
| Live settings | Apply changes inside Zotero without editing CSS |
| Status integration | Optional styling for `/done`, `/reading`, and `/unread` Style columns |
| Clean shutdown | Removes injected styles, timers, and native views and restores theme state |

---

## Architecture

```mermaid
flowchart LR
    A[Zotero Plugin Runtime] --> B[JavaScript ctypes bridge]
    B --> C[Objective-C Runtime]
    C --> D[AppKit NSVisualEffectView]
    D --> E[Native blur and tint]
    A --> F[Scoped reader and library CSS]
    F --> G[Unified Zotero surfaces]
    H[In-app settings] --> A
```

The native view performs window-level background sampling and blur. Scoped plugin CSS lets Zotero's own panels reveal that material correctly. Both layers are bundled in the XPI.

---

## Requirements

| Item | Requirement |
| :--- | :--- |
| Operating system | macOS |
| Zotero | 9.x |
| Theme | Dark only; enabled automatically while the plugin is active |
| Processor | Apple Silicon or Intel Mac |
| Helper process | None |
| External dynamic library | None |

Windows and Linux are not currently supported. Matching those platforms requires separate native DWM/Mica or desktop-environment backends. Zotero's light theme is also not currently supported.

---

## Installation

1. Download the latest `Zotero-Glass-*.xpi` from [Releases](https://github.com/Avi7ii/Zotero-glass/releases/latest).
2. Open Zotero and go to **Tools > Plugins**.
3. Open the gear menu and choose **Install Plugin From File**.
4. Select the XPI and restart Zotero if requested.

Open settings from the Zotero Glass button in the main toolbar or from **Tools > Zotero Glass Preferences**.

---

## Settings

| Control | Purpose |
| :--- | :--- |
| Background transparency | Controls how much of the desktop and rear windows remains visible |
| Blur strength | Controls diffusion and background legibility |
| Background color | Adds a consistent dark or colored tint over the system material |
| Glass material | Selects HUD, under-window, sidebar, menu, or regular-window AppKit materials |
| Independent sidebar controls | Gives the library and reader sidebars a separate appearance profile |

Settings are stored at:

```text
~/Library/Application Support/ZoteroGlass/config.json
```

---

## Build from source

```bash
git clone https://github.com/Avi7ii/Zotero-glass.git
cd Zotero-glass
./build.sh
```

The script runs the complete test suite before writing an installable XPI to `dist/`.

---

## FAQ

<details>
<summary><b>Does the plugin modify my Zotero data or column layout?</b></summary>
<br>
No. The public build does not rewrite library items, tags, PDFs, databases, or user column preferences. It manages only its own settings, native window material, and scoped UI styles.
</details>

<details>
<summary><b>Why is only the dark theme supported?</b></summary>
<br>
Every material, tint mask, text contrast level, and PDF sidebar layer is calibrated around Zotero's dark interface. The plugin switches to dark mode while active and restores the prior theme state when disabled. A light theme requires a separate material and readability calibration that is not included in the current release.
</details>

<details>
<summary><b>What remains after disabling the plugin?</b></summary>
<br>
Injected styles, timers, and native views are removed, and the prior Zotero theme setting is restored. The user configuration file remains so settings survive a later reinstall.
</details>

<details>
<summary><b>Why are journal badges missing?</b></summary>
<br>
Journal rankings and impact factors require Ethereal Style/EasyScholar. Zotero Glass deliberately does not bundle or fabricate third-party academic evaluation data.
</details>

---

<div align="center">

### Research should feel at home on the Mac.

Made for Zotero, backed by native AppKit.

[Issues](https://github.com/Avi7ii/Zotero-glass/issues) · [Releases](https://github.com/Avi7ii/Zotero-glass/releases) · [Pull requests](https://github.com/Avi7ii/Zotero-glass/pulls)

<br>

![Star History](https://api.star-history.com/svg?repos=Avi7ii/Zotero-glass&type=Date)

</div>
