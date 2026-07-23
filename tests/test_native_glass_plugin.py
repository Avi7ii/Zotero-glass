import json
import re
import unittest
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "zotero-glass-plugin"


class NativeGlassPluginTests(unittest.TestCase):
    def test_build_runs_style_lifecycle_scenarios(self):
        build = (ROOT / "build.sh").read_text()

        self.assertIn('node "$ROOT/tests/test_style_lifecycle.js"', build)

    def test_build_packages_native_preferences_pane_assets(self):
        build = (ROOT / "build.sh").read_text()

        for asset in [
            "chrome/content/preferences.xhtml",
            "chrome/content/preferences.css",
        ]:
            with self.subTest(asset=asset):
                self.assertIn(asset, build)

    def test_plugin_does_not_start_external_helper(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        forbidden = [
            "ZoteroGlassHelper",
            "nsIProcess",
            "runAsync",
            "helper started from plugin",
        ]
        for token in forbidden:
            with self.subTest(token=token):
                self.assertNotIn(token, source)

    def test_plugin_contains_native_appkit_bridge(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("NativeGlassBridge", source)
        self.assertIn("ctypes", source)
        self.assertIn("ZoteroGlassInstall", source)
        self.assertIn("ZoteroGlassApply", source)
        self.assertIn("objc_getClass", source)
        self.assertIn("libobjc.A.dylib", source)
        self.assertIn("NSVisualEffectView", source)
        self.assertIn("isZoteroMainWindow", source)
        self.assertIn('this.nsString("Zotero")', source)
        self.assertNotIn('this.sel("setHasShadow:")', source)
        self.assertIn("suppressContentBorders", source)
        self.assertIn("restoreContentBorders", source)
        self.assertIn('this.sel("setContentBorderThickness:forEdge:")', source)
        self.assertIn(
            'this.sel("setAutorecalculatesContentBorderThickness:forEdge:")',
            source,
        )
        self.assertIn("contentBorderStates.clear()", source)

    def test_content_border_suppression_only_uses_safe_bottom_edge(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        suppress = source.split("suppressContentBorders(window) {", 1)[1].split(
            "\n  restoreContentBorders(window) {", 1
        )[0]
        restore = source.split("restoreContentBorders(window) {", 1)[1].split(
            "\n  isZoteroMainWindow(window) {", 1
        )[0]

        self.assertIn("const edges = [1];", suppress)
        self.assertIn("edges: edges.map(edge => ({", suppress)
        self.assertIn("for (const edge of edges)", suppress)
        self.assertNotIn("[0, 1, 2, 3]", suppress)
        self.assertIn("for (const edgeState of state.edges)", restore)

    def test_native_code_uses_nsvisualeffectview(self):
        native_source = ROOT / "native/ZoteroGlassNative.m"

        self.assertTrue(native_source.exists())
        source = native_source.read_text()
        self.assertIn("NSVisualEffectView", source)
        self.assertIn("NSVisualEffectMaterial", source)
        self.assertIn("NSVisualEffectBlendingModeBehindWindow", source)

    def test_manifest_version_marks_native_bridge_build(self):
        manifest = json.loads((PLUGIN / "manifest.json").read_text())

        self.assertGreaterEqual(manifest["version"], "0.2.0")
        self.assertEqual(manifest["applications"]["zotero"]["id"], "zotero-glass@avi7ii.github.io")
        self.assertEqual(
            manifest["applications"]["zotero"]["update_url"],
            "https://raw.githubusercontent.com/Avi7ii/Zotero-glass/main/updates.json",
        )
        self.assertEqual(manifest["applications"]["zotero"]["strict_min_version"], "9.0")
        self.assertEqual(manifest["applications"]["zotero"]["strict_max_version"], "9.*")

    def test_update_manifest_matches_release_metadata(self):
        manifest = json.loads((PLUGIN / "manifest.json").read_text())
        updates = json.loads((ROOT / "updates.json").read_text())
        plugin_id = manifest["applications"]["zotero"]["id"]
        entry = updates["addons"][plugin_id]["updates"][0]

        self.assertEqual(entry["version"], manifest["version"])
        self.assertEqual(
            entry["update_link"],
            f"https://github.com/Avi7ii/Zotero-glass/releases/download/"
            f"v{manifest['version']}/Zotero-Glass-{manifest['version']}.xpi",
        )
        self.assertRegex(entry["update_hash"], re.compile(r"^sha256:[0-9a-f]{64}$"))
        self.assertEqual(
            entry["applications"]["zotero"],
            {
                "strict_min_version": manifest["applications"]["zotero"]["strict_min_version"],
                "strict_max_version": manifest["applications"]["zotero"]["strict_max_version"],
            },
        )

    def test_plugin_has_main_window_entry_and_visible_status(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("toolbarbuttonID", source)
        self.assertIn("zotero-glass-toolbarbutton", source)
        self.assertIn("openPreferences", source)
        self.assertIn("nativeStatus", source)

    def test_reader_stylesheet_is_registered_globally(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("nsIStyleSheetService", source)
        self.assertIn("loadAndRegisterSheet", source)
        self.assertIn("USER_SHEET", source)
        self.assertIn("unregisterSheet", source)

    def test_preferences_use_normal_glass_controls(self):
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()

        required_labels = [
            "背景透明度",
            "模糊强度",
            "背景颜色",
            "标签不透明度",
            "玻璃材质",
            "自动保存",
        ]
        for label in required_labels:
            with self.subTest(label=label):
                self.assertIn(label, prefs)

        self.assertNotIn("<html:select", prefs)
        self.assertNotIn("toLocaleTimeString", prefs)
        self.assertNotIn("插件状态", prefs)
        self.assertNotIn("原生桥接", prefs)
        self.assertNotIn("native-status", prefs)
        self.assertNotIn("config-path", prefs)
        self.assertIn("material-options", prefs)
        self.assertNotIn("appearance-switch", prefs)
        self.assertNotIn("appearance-button", prefs)
        self.assertNotIn("data-appearance", prefs)
        self.assertNotIn("selectedAppearance", prefs)
        self.assertIn('data-material="hud"', prefs)
        self.assertNotIn("PDF 保持亮色", prefs)

    def test_preferences_use_refined_neutral_glass_layout(self):
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()
        css = (PLUGIN / "chrome/content/preferences.css").read_text()
        combined = prefs + css

        for token in [
            'class="card"',
            'class="glass-intro"',
            "--zotero-glass-pref-page: rgba(18, 19, 21, 0.68)",
            "backdrop-filter: blur(56px) saturate(1.18)",
            "--zotero-glass-pref-accent: #6f91b7",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, combined)

        for token in ["linear-gradient", "#92cfff", "#74b9ff"]:
            with self.subTest(token=token):
                self.assertNotIn(token, combined)

    def test_preferences_are_a_native_zotero_fragment(self):
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()

        self.assertTrue(prefs.lstrip().startswith("<?xml-stylesheet"))
        self.assertIn("\n<vbox", prefs)
        self.assertIn('class="main-section"', prefs)
        self.assertIn("Zotero.ZoteroGlass.preferences.init(event.currentTarget)", prefs)
        self.assertNotIn("<window", prefs)
        self.assertNotIn("window.arguments", prefs)

        wrapped = (
            '<box xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" '
            'xmlns:html="http://www.w3.org/1999/xhtml">'
            + prefs
            + "</box>"
        )
        ElementTree.fromstring(wrapped)

    def test_preferences_styles_are_scoped_to_the_glass_pane(self):
        css = (PLUGIN / "chrome/content/preferences.css").read_text()

        for selector in [
            ".card",
            ".status",
            ".value",
            ".action",
            ".setting-row",
            ".material-option",
        ]:
            with self.subTest(selector=selector):
                self.assertNotRegex(css, rf"(?m)^{re.escape(selector)}(?:[\s,:{{])")
                self.assertIn(f"#zotero-glass-preferences-pane {selector}", css)

    def test_preferences_expose_live_tag_background_opacity(self):
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn('id="styleTagBackgroundOpacity"', prefs)
        self.assertIn('min="0.2" max="1" step="0.01"', prefs)
        self.assertIn('"styleTagBackgroundOpacity"', source)
        self.assertIn("this.api.writeConfig(this.config)", source)
        self.assertIn("修改会自动保存并立即应用", prefs)

    def test_config_uses_current_dark_profile_as_single_default(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("appearanceConfig", source)
        self.assertIn("sidebarAppearanceConfig", source)
        self.assertIn("sanitizeAppearanceConfig", source)
        self.assertNotIn("pdfKeepLightInDarkMode", source)
        self.assertIn("sidebarIndependent", source)
        self.assertIn("styleTagBackgroundOpacity: 0.85", source)
        self.assertIn("sidebar:", source)
        for token in [
            'backgroundTransparency: 0.73',
            'blurStrength: 92',
            'backgroundColor: "#1A1A1A"',
            'backgroundTransparency: 0.92',
            'blurStrength: 100',
            'backgroundColor: "#06090A"',
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)

        defaults = source.split("defaults: {", 1)[1].split("statusTagColors:", 1)[0]
        self.assertNotIn("selectedAppearance", defaults)
        self.assertNotIn("light:", defaults)
        self.assertNotIn("dark:", defaults)

    def test_plugin_forces_zotero_dark_mode_on_startup(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("forceDarkMode", source)
        self.assertIn('Services.prefs.setIntPref("browser.theme.toolbar-theme", 0)', source)
        startup = source.split("async startup(rootURI)", 1)[1].split("shutdown()", 1)[0]
        self.assertIn("this.forceDarkMode()", startup)

    def test_startup_rewrites_legacy_theme_config_to_single_profile(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        startup = source.split("async startup(rootURI)", 1)[1].split("shutdown()", 1)[0]

        self.assertIn("this.writeConfig(this.readConfig())", startup)
        self.assertIn("...(config.dark || {})", source)
        self.assertIn("...(config.sidebar?.dark || config.sidebar || {})", source)

    def test_reader_annotation_popups_use_readable_dark_glass(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for selector in [
            ".view-popup",
            ".selection-popup",
            ".annotation-popup",
            ".label-popup",
            ".appearance-popup",
            ".find-popup",
            ".context-menu",
        ]:
            with self.subTest(selector=selector):
                self.assertIn(selector, css)

        self.assertIn("--zotero-glass-popup-bg", css)
        self.assertIn("rgba(16, 19, 21, 0.68)", css)
        self.assertIn("backdrop-filter: blur(56px)", css)
        self.assertIn("border: 1px solid rgba(255, 255, 255, 0.14)", css)

    def test_ztoolkit_command_palette_has_a_readable_glass_surface(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for selector in [
            "#zotero-plugin-toolkit-prompt",
            ".prompt-container",
            ".prompt-container .input-container input",
            ".prompt-container .commands-container .selected",
        ]:
            with self.subTest(selector=selector):
                self.assertIn(selector, css)

        prompt = css.split(
            ':root[zotero-glass-active="true"] #zotero-plugin-toolkit-prompt,', 1
        )[1].split('}', 1)[0]
        self.assertIn("rgba(16, 19, 21, 0.78)", prompt)
        self.assertIn("backdrop-filter: blur(42px)", prompt)
        self.assertNotIn("background-color: transparent", prompt)

    def test_pdf_original_preview_feature_is_removed(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            "pdfKeepLightInDarkMode",
            "registerPdfOriginalToolbarButton",
            "renderPdfOriginalToolbarButton",
            "setPdfOriginalPreview",
            "installPdfOriginalThemeLock",
            "maintainPdfOriginalPreviews",
            "zotero-glass-pdf-original-toggle",
            "PDF 原版预览",
        ]:
            with self.subTest(token=token):
                self.assertNotIn(token, source)
                self.assertNotIn(token, css)

    def test_preferences_use_zotero_native_sidebar_entry_and_reapply_glass(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        bootstrap = (PLUGIN / "bootstrap.js").read_text()

        self.assertIn("Zotero.PreferencePanes.register", source)
        self.assertIn('preferencePaneID: "zotero-glass-preferences"', source)
        self.assertIn('label: "Glass"', source)
        self.assertIn('src: this.rootURI + "chrome/content/preferences.xhtml"', source)
        self.assertIn(
            '<?xml-stylesheet type="text/css" href="chrome://zotero-glass/content/preferences.css"?>',
            (PLUGIN / "chrome/content/preferences.xhtml").read_text(),
        )
        self.assertIn("Zotero.Utilities.Internal.openPreferences(this.preferencePaneID)", source)
        self.assertIn("await pluginScope.ZoteroGlass.startup(rootURI)", bootstrap)
        self.assertIn("ZoteroGlass.preferences = {", source)
        self.assertIn("this.api.applyCurrent()", source)
        self.assertIn('setAttribute(\n      "zotero-glass-preferences-active"', source)
        registration = source.split("async registerPreferencePane()", 1)[1].split(
            "openPreferences()", 1
        )[0]
        self.assertNotIn("scripts:", registration)
        self.assertNotIn("stylesheets:", registration)
        self.assertIn("Zotero.PreferencePanes.pluginPanes?.find", registration)
        self.assertIn("Zotero.PreferencePanes.unregister(stalePane.id)", registration)
        self.assertIn("unregisterPreferencePane", source)
        self.assertFalse((PLUGIN / "chrome/content/preferences.js").exists())
        self.assertNotIn("openDialog", source)

    def test_pdf_reader_sidebars_are_glass_targets(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        required_selectors = [
            "#reader",
            "#reader-ui",
            "#thumbnailView",
            "#outlineView",
            "#annotationsView",
            "#item-pane",
            "#context-pane",
            "#zotero-item-pane",
            "#zotero-context-pane",
            "#viewerContainer",
            ".reader-sidebar",
            ".split-view",
            ".pdfViewer",
        ]
        for selector in required_selectors:
            with self.subTest(selector=selector):
                self.assertIn(selector, css)

        self.assertIn("injectReaderSidebarGlassStyle", source)
        self.assertIn("zotero-glass-reader-sidebar-style", source)
        self.assertIn("--zotero-glass-sidebar-bg", source)
        self.assertIn("--zotero-glass-sidebar-blur", source)

    def test_style_tags_use_render_hook_without_column_manager_access(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            "startStyleTagIntegration",
            "stopStyleTagIntegration",
            "Zotero.Plugins.addObserver",
            "Zotero.Plugins.removeObserver",
            'win?.require?.("zotero/itemTree")?.prototype',
            "prototype?._renderCell",
            "styleTagKindForDataKey",
            "installStyleTagRenderHook",
            "refreshVisibleStyleTags",
            "decorateStyleTagCell",
            "solidifyStyleStatusCell",
            "solidifyStyleTextTagCell",
            "styleTagPalette",
            "zoterostyle-status",
            "zoterostyle-textTags",
            "zoterostyle-publicationTags",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)

        for token in [
            "startUIRepairWatcher",
            "stopUIRepairWatcher",
            "repairMainWindows",
            "stabilizeStatusColumnChips",
            "stabilizeTextTagColumnChips",
            "zotero-glass-status-chip",
            "zotero-glass-text-tag-chip",
            "MutationObserver",
            "setInterval",
            "clearInterval",
            "manager.unregisterColumn",
            "manager.registerColumn",
            "Zotero.ItemTreeManager",
            "Zotero.ItemTreeManager.refreshColumns",
            "getCustomColumns",
            "_columnManager",
            "cached.renderCell",
            "patchOpenItemTreeRenderers",
            "invalidateStyleColumnViews",
            "view._columns",
            "itemsView._columns",
            "_resetColumns",
            "_loadColumnPrefsFromFile",
            "refreshAndMaintainSelection",
            '"extensions.zotero.zoterostyle.textTagsColumn.opacity"',
            '"extensions.zotero.zoterostyle.textTagsColumn.textColor"',
        ]:
            with self.subTest(token=token):
                self.assertNotIn(token, source)
                self.assertNotIn(token, css)

    def test_style_render_hook_follows_plugin_lifecycle_without_polling(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        lifecycle_source = source.split("  startStyleTagIntegration() {", 1)[1].split(
            "  applyReaderDocumentPreferences", 1
        )[0]

        for token in [
            "stylePluginLifecycleObserver",
            "isStylePluginID",
            'startup: ({ id }) =>',
            'this.refreshStyleTagIntegration("style-startup")',
            'this.refreshStyleTagIntegration("glass-startup")',
            "prototype._renderCell = wrapper",
            "prototype._renderCell = hook.original",
            'win?.ZoteroPane?.itemsView?.tree',
            'typeof tree?.invalidate === "function"',
            "styleTagIntegrationActive",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)

        for token in ["setTimeout", "setInterval", "MutationObserver"]:
            with self.subTest(token=token):
                self.assertNotIn(token, lifecycle_source)

    def test_one_opacity_setting_covers_all_style_tag_types(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()

        for token in ["status", "textTags", "publicationTags"]:
            with self.subTest(token=token):
                self.assertIn(token, source)

        self.assertIn("styleTagBackgroundOpacity: 0.85", source)
        self.assertIn("所有标签不透明度", prefs)
        self.assertIn("状态、#标签和期刊标签", prefs)
        self.assertNotIn("--zotero-glass-style-tag-opacity", source)
        self.assertNotIn("statusTagColors", source)
        for color in ["#5D9478", "#B9974D", "#6FAFDB"]:
            self.assertNotIn(color, source)
        self.assertNotIn("invalidateStyleColumnViews", source)
        self.assertNotIn("tagOpacityChanged", source)
        self.assertIn('setProperty("background-color", palette.background, "important")', source)
        self.assertIn("solidifyStyleTextTagCell", source)
        self.assertIn("styleBackgroundFromNode", source)
        self.assertIn("styleStatusColorFromData", source)
        self.assertIn("styleTagPalette", source)
        self.assertIn("const luminance", source)
        self.assertIn(
            '`rgba(${rgb.join(", ")}, ${this.styleTagBackgroundOpacity})`',
            source,
        )
        self.assertIn('foreground: darkText ? "#111418" : "#FFFFFF"', source)
        self.assertIn('this.refreshStyleTagIntegration("config-change")', source)
        self.assertNotIn('setProperty("opacity", "0.85"', source)
        self.assertIn('this.solidifyStyleTextTagCell(cell, true)', source)
        self.assertIn('this.solidifyStyleTextTagCell(cell, false)', source)

        text_tag_renderer = source.split("  solidifyStyleTextTagCell(cell", 1)[1].split(
            "  styleBackgroundFromNode", 1
        )[0]
        self.assertIn("forceReadableText = false", text_tag_renderer)
        self.assertIn('setProperty("color", palette.foreground, "important")', text_tag_renderer)
        self.assertIn('setProperty("opacity", "1", "important")', text_tag_renderer)

        status_renderer = source.split("  solidifyStyleStatusCell(cell", 1)[1].split(
            "  solidifyStyleTextTagCell(cell", 1
        )[0]
        self.assertIn('const inner = cell.querySelector?.(".inner")', status_renderer)
        self.assertIn("const chip = inner?.parentElement || cell.firstElementChild", status_renderer)
        self.assertIn("this.styleStatusColorFromData(data)", status_renderer)
        self.assertIn('setProperty("background-color", palette.background, "important")', status_renderer)
        self.assertNotIn('setProperty("background", "transparent"', status_renderer)
        self.assertNotIn('setProperty("background-color", "transparent"', status_renderer)
        self.assertNotIn('setProperty("border",', status_renderer)
        self.assertNotIn('setProperty("box-shadow",', status_renderer)
        self.assertNotIn('setProperty("border-radius"', status_renderer)

    def test_reader_uses_lifecycle_events_instead_of_fixed_interval_scans(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        for token in [
            "startReaderLifecycleIntegration",
            "stopReaderLifecycleIntegration",
            "Zotero.Reader.registerEventListener",
            '"renderToolbar"',
            '"zotero-glass-reader-tabs"',
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)
        for token in ["startReaderWatcher", "stopReaderWatcher", "setInterval", "clearInterval"]:
            with self.subTest(token=token):
                self.assertNotIn(token, source)

    def test_plugin_does_not_rewrite_item_tree_layout_preferences(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        bootstrap = (PLUGIN / "bootstrap.js").read_text()

        for token in [
            "repairItemTreeColumns",
            "repairTreePrefsFile",
            "restoredItemTreeColumns",
            "treePrefs.json",
            "column-layouts",
            "captureColumnLayoutSnapshot",
            "restoreColumnLayoutSnapshot",
            "_columnPrefs",
            "_resetColumns",
            "_writeColumnPrefsToFile",
            ".unregisterColumn(",
            ".registerColumn(",
            ".refreshColumns(",
        ]:
            with self.subTest(token=token):
                self.assertNotIn(token, source)
                self.assertNotIn(token, bootstrap)

    def test_shutdown_cleans_injected_reader_state_and_pending_work(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        for token in [
            "cleanupInjectedDocumentStyles",
            "cleanupDocumentStyles",
            'getElementById("zotero-glass-reader-sidebar-style")?.remove()',
            "stopReaderLifecycleIntegration",
            "stopStyleTagIntegration",
            "Zotero.Notifier.unregisterObserver",
            "restoreToolbarTheme",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)

    def test_library_item_tree_header_and_reader_sidebars_are_deep_glass(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            "#zotero-items-tree .virtualized-table-header",
            "#zotero-items-tree .virtualized-table .row.odd",
            "--material-sidepane",
            "--material-toolbar",
            "#sidebarContainer .sidebar-toolbar",
            "#context-pane-inner",
            "#thumbnailsView",
            ".viewWrapper",
        ]:
            with self.subTest(token=token):
                self.assertTrue(token in css or token in source)

    def test_library_columns_have_subtle_vertical_dividers(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        self.assertIn(
            "#zotero-items-tree .virtualized-table-header > .cell:not(:last-child)",
            css,
        )

    def test_tab_bar_column_header_and_reader_toolbar_use_separate_glass_tiers(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn('#zotero-title-bar {', css)
        self.assertIn('#tab-bar-container,', css)
        self.assertIn('#zotero-tabs-toolbar {', css)
        self.assertIn('--material-tabbar: rgba(7, 9, 10, 0.18)', css)
        self.assertIn('rgba(7, 9, 10, 0.18) !important;', css)
        self.assertIn('rgba(7, 9, 10, 0.02) !important;', css)
        self.assertIn('#reader-ui > .toolbar,', css)
        self.assertIn('#reader > .toolbar {', css)
        self.assertIn('--zotero-glass-reader-toolbar-bg', source)
        self.assertIn('const toolbarAlpha = this.clamp(alpha + 0.10, 0.14, 0.32)', source)
        self.assertIn('--tab-border: 0.5px solid rgba(255, 255, 255, 0.18)', css)
        self.assertIn('#tab-bar-container .tab:not(:last-child)::after', css)
        self.assertIn('inset-block: 0', css)
        self.assertIn('background-color: rgba(255, 255, 255, 0.22)', css)
        self.assertIn('#tab-bar-container .tab.selected {', css)
        self.assertNotIn('inset 0 -2px 0 rgba(111, 145, 183, 0.95)', css)
        self.assertIn('#tab-bar-container .tab.selected .tab-name', css)
        self.assertIn('font-weight: 600 !important', css)
        inactive_tab = css.split(
            '#tab-bar-container .tab:not(.selected) {', 1
        )[1].split('}', 1)[0]
        self.assertIn('border-bottom: 0 !important', inactive_tab)
        title_bar = css.split('#zotero-title-bar {', 1)[1].split(
            '#tab-bar-container {', 1
        )[0]
        self.assertNotIn('linear-gradient', title_bar)
        self.assertIn('box-shadow: none !important', title_bar)
        self.assertIn('this.sel("setEmphasized:"), 0', source)
        self.assertNotIn('this.sel("setEmphasized:"), 1', source)
        self.assertNotIn('body > .toolbar', css)
        self.assertNotIn('body > .toolbar', source)
        self.assertIn(
            "#zotero-items-tree .virtualized-table .row > .cell:not(:last-child)",
            css,
        )
        self.assertIn(
            "border-inline-end: 1px solid rgba(255, 255, 255, 0.12) !important;",
            css,
        )

    def test_reader_thumbnail_sidebar_has_no_css_tint_or_white_fog(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        self.assertIn(
            "body.sidebar-open #sidebarContainer {\n"
            "  background: transparent !important;\n"
            "  background-image: none !important;",
            source,
        )
        self.assertIn(
            "#reader-ui #annotationsView .selector {\n"
            "  background: transparent !important;\n"
            "  background-image: none !important;",
            source,
        )
        self.assertIn(
            "#sidebarContainer {\n"
            "  background: transparent !important;\n"
            "  background-image: none !important;",
            css,
        )

    def test_reader_sidebar_is_excluded_from_the_native_full_window_tint(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        for token in [
            "syncReaderNativeTintCutout",
            "readerGlassGeometry",
            "applyTintRegions",
            "ZoteroGlassTintRegion",
            "subtractRect",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, source)

    def test_reader_chrome_reuses_one_unstacked_native_material(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            "zotero-glass-reader-active",
            "setReaderGlassActive",
            "readerGlassGeometry",
            "/* unified-reader-glass */",
            "#reader-ui > .toolbar",
            "#reader-ui #sidebarContainer",
            "#reader-ui #split-view",
            ':root[zotero-glass-reader-active="true"] #zotero-context-pane',
        ]:
            with self.subTest(token=token):
                self.assertTrue(token in source or token in css)

        self.assertNotIn("radial-gradient(120% 100%", css)

    def test_library_sidebar_stays_aligned_when_narrow(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            "#zotero-tag-selector-container",
            ".tag-selector-filter-container .search",
            "min-width: 0",
            "#zotero-tags-splitter",
            "#zotero-collections-splitter",
            "overflow: hidden",
            "box-shadow: inset 0 1px",
            "box-shadow: inset 1px 0",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, css)

    def test_collapsed_collection_pane_does_not_leak_its_toolbar(self):
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in [
            '#zotero-collections-pane[collapsed="true"]',
            "#zotero-toolbar-collection-tree",
            "visibility: collapse",
            "max-width: 0",
        ]:
            with self.subTest(token=token):
                self.assertIn(token, css)

    def test_preferences_expose_sidebar_independent_controls(self):
        prefs = (PLUGIN / "chrome/content/preferences.xhtml").read_text()

        required_labels = [
            "侧栏独立调节",
            "侧栏透明度",
            "侧栏模糊",
            "侧栏颜色",
        ]
        for label in required_labels:
            with self.subTest(label=label):
                self.assertIn(label, prefs)

        self.assertIn("sidebarIndependent", prefs)
        self.assertIn("sidebarControls", prefs)
        self.assertIn("sidebarBackgroundTransparency", prefs)
        self.assertIn("sidebarBlurStrength", prefs)
        self.assertIn("sidebarBackgroundColor", prefs)


if __name__ == "__main__":
    unittest.main()
