import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "zotero-glass-plugin"


class NativeGlassPluginTests(unittest.TestCase):
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
        self.assertNotIn("update_url", manifest["applications"]["zotero"])
        self.assertEqual(manifest["applications"]["zotero"]["strict_min_version"], "9.0")
        self.assertEqual(manifest["applications"]["zotero"]["strict_max_version"], "9.*")

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
            "玻璃材质",
            "保存并应用",
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
        self.assertNotIn("subtitle", prefs)
        self.assertNotIn("hint", prefs)
        self.assertIn("material-options", prefs)
        self.assertNotIn("appearance-switch", prefs)
        self.assertNotIn("appearance-button", prefs)
        self.assertNotIn("data-appearance", prefs)
        self.assertNotIn("selectedAppearance", prefs)
        self.assertIn('data-material="hud"', prefs)
        self.assertNotIn("PDF 保持亮色", prefs)

    def test_config_uses_current_dark_profile_as_single_default(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("appearanceConfig", source)
        self.assertIn("sidebarAppearanceConfig", source)
        self.assertIn("sanitizeAppearanceConfig", source)
        self.assertNotIn("pdfKeepLightInDarkMode", source)
        self.assertIn("sidebarIndependent", source)
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
        startup = source.split("async startup()", 1)[1].split("shutdown()", 1)[0]
        self.assertIn("this.forceDarkMode()", startup)

    def test_startup_rewrites_legacy_theme_config_to_single_profile(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        startup = source.split("async startup()", 1)[1].split("shutdown()", 1)[0]

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

    def test_preferences_window_reapplies_native_glass_when_opened(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        self.assertIn("const dialog = win.openDialog", source)
        self.assertIn('dialog.addEventListener("load"', source)
        self.assertIn("dialog.document.documentElement.setAttribute", source)
        self.assertIn("this.applyConfig(this.readConfig())", source)

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

    def test_style_status_tags_are_not_runtime_rewritten(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()
        css = (PLUGIN / "chrome/content/glass.css").read_text()

        for token in ["/done", "/reading", "/unread"]:
            with self.subTest(token=token):
                self.assertIn(token, source)

        for color in ["#5D9478", "#B9974D", "#6FAFDB"]:
            with self.subTest(color=color):
                self.assertIn(color, source)

        self.assertNotIn("this.restyleStatusColumnTags(doc)", source)
        self.assertIn("#zotero-items-tree .cell.zoterostyle-status", source)
        self.assertIn("stabilizeStatusColumnChips", source)
        self.assertIn("findCompactStatusAncestor", source)
        self.assertNotIn("this.restyleStatusTags(doc)", source)
        self.assertNotIn("STATUS_PROBE", source)
        self.assertNotIn("logStatusColumnProbe", source)
        self.assertIn("zotero-glass-status-chip", source)
        self.assertIn("getBoundingClientRect", source)
        self.assertIn("dot: \"#FFFFFF\"", source)
        self.assertIn(".zotero-glass-status-chip .circle > div", css)
        self.assertIn('[style*="0.6rem"]', css)
        self.assertNotIn(".zotero-glass-status-chip::before", css)
        self.assertNotIn("0 0 0 2px rgba(255, 255, 255, 0.62)", source)
        self.assertNotIn('node.style.setProperty("width", "10px"', source)
        self.assertNotIn('node.style.setProperty("height", "10px"', source)
        self.assertNotIn("border: 1px solid currentColor", css)
        self.assertIn("opacity: 1", css)
        self.assertIn("background-image: none", css)
        self.assertIn("isolation: isolate", css)
        self.assertIn("mix-blend-mode: normal", css)

    def test_plugin_does_not_rewrite_user_column_preferences(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        for token in ["repairItemTreeColumns", "repairTreePrefsFile", "restoredItemTreeColumns", "treePrefs.json"]:
            with self.subTest(token=token):
                self.assertNotIn(token, source)

    def test_shutdown_cleans_injected_reader_state_and_pending_work(self):
        source = (PLUGIN / "chrome/content/zoteroGlass.js").read_text()

        for token in [
            "cleanupInjectedDocumentStyles",
            "cleanupDocumentStyles",
            'getElementById("zotero-glass-reader-sidebar-style")?.remove()',
            "clearTimeout",
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
