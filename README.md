# Zotero Glass

Zotero Glass brings native macOS glass materials to Zotero by inserting an
`NSVisualEffectView` through Zotero's plugin runtime. It does not require a
helper application, `userChrome.css`, a LaunchAgent, or a separately compiled
dynamic library.

Zotero Glass 通过 Zotero 插件运行时直接调用 macOS `NSVisualEffectView`，为
Zotero 主界面、PDF 阅读器侧栏和弹出面板提供原生磨砂玻璃效果。无需 Helper、
`userChrome.css`、LaunchAgent 或额外动态库。

## Requirements / 系统要求

- macOS
- Zotero 9.x

Windows and Linux are not currently supported because the native bridge uses
AppKit. 当前版本仅支持 macOS，因为原生桥接依赖 AppKit。

## Features / 功能

- Native macOS glass backed by `NSVisualEffectView`
- Glass styling for the library and PDF reader sidebars
- Readable translucent PDF annotation popups
- Independent sidebar transparency, blur, color, and material controls
- In-app settings entry in the main toolbar and Tools menu
- Automatic dark-mode activation while the plugin is enabled
- Optional visual integration with Ethereal Style status and journal columns

## Installation / 安装

1. Download the `.xpi` file from [Releases](https://github.com/Avi7ii/Zotero-glass/releases).
2. Open Zotero and choose **Tools > Plugins**.
3. Open the gear menu, choose **Install Plugin From File**, and select the XPI.
4. Restart Zotero if requested.

安装后可通过 Zotero 首页工具栏的玻璃按钮，或 **工具 > Zotero Glass 偏好设置**
调整参数。

## Build / 构建

```sh
./build.sh
```

The tested XPI is written to `dist/`. 构建脚本会先运行测试，再在 `dist/` 生成 XPI。

## Notes / 说明

- User settings are stored in `~/Library/Application Support/ZoteroGlass/config.json`.
- Journal rankings and impact factors are supplied by Ethereal Style/EasyScholar;
  Zotero Glass only styles those fields when they are present.
- `/done`, `/reading`, and `/unread` remain ordinary Zotero tags. The plugin only
  changes their presentation when the corresponding Style column is available.

## License

[MIT](LICENSE)
