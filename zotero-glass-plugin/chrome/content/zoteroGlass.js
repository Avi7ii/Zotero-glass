var NativeGlassBridge = {
  ctypes: null,
  objc: null,
  appKit: null,
  available: false,
  lastError: "",
  lastCode: null,
  libraryPath: "/usr/lib/libobjc.A.dylib",
  selectors: {},
  classes: {},
  types: null,
  f: null,
  maxTintRegions: 8,
  contentBorderStates: new Map(),

  init(plugin) {
    if (this.available) {
      return true;
    }
    if (!this.isMac()) {
      this.lastError = "This build only enables native glass on macOS.";
      return false;
    }

    try {
      this.ctypes = this.importCtypes();
      this.openSystemLibraries();
      this.declareObjCRuntime();
      this.lastCode = this.ZoteroGlassInstall();
      this.available = this.lastCode === 0;
      this.lastError = this.available ? "" : "Native install returned " + this.lastCode;
      return this.available;
    } catch (error) {
      this.available = false;
      this.lastError = String(error);
      plugin.log("native bridge init failed: " + this.lastError);
      return false;
    }
  },

  apply(plugin, config) {
    if (!this.available && !this.init(plugin)) {
      return this.status();
    }

    try {
      this.lastCode = this.ZoteroGlassApply(plugin, config);
      this.available = this.lastCode === 0;
      this.lastError = this.available ? "" : "Native apply returned " + this.lastCode;
    } catch (error) {
      this.available = false;
      this.lastError = String(error);
      plugin.log("native bridge apply failed: " + this.lastError);
    }
    return this.status();
  },

  applyTintRegions(plugin, geometry, config) {
    if (!this.available || !geometry) {
      return false;
    }

    try {
      const app = this.sharedApplication();
      let window = this.f.msg_id(app, this.sel("mainWindow"));
      if (this.isNil(window)) {
        window = this.f.msg_id(app, this.sel("keyWindow"));
      }
      if (this.isNil(window)) {
        return false;
      }

      const contentView = this.f.msg_id(window, this.sel("contentView"));
      const effectView = this.findSubviewWithIdentifier(contentView, "ZoteroGlassEffectView");
      const fullTint = this.findSubviewWithIdentifier(effectView, "ZoteroGlassTintView");
      if (this.isNil(effectView) || this.isNil(fullTint)) {
        return false;
      }

      const rgb = plugin.hexToRgb(config.backgroundColor);
      const alpha = plugin.overlayAlphaForTransparency(config.backgroundTransparency);
      const tintColor = this.f.msg_id_d4(
        this.cls("NSColor"),
        this.sel("colorWithCalibratedRed:green:blue:alpha:"),
        rgb.red,
        rgb.green,
        rgb.blue,
        alpha
      );
      const cgColor = this.f.msg_id(tintColor, this.sel("CGColor"));
      const cutouts = Array.isArray(geometry.cutouts) ? geometry.cutouts : [];

      if (!cutouts.length) {
        this.setTintView(fullTint, this.largeRect(), cgColor, false);
        this.hideTintRegions(effectView, 0);
        return true;
      }

      const nativeCutouts = cutouts.map(rect => ({
        x: rect.x,
        y: geometry.height - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      }));
      const regions = plugin.tintRegionsForCutouts(
        { x: 0, y: 0, width: 10000, height: 10000 },
        nativeCutouts
      ).slice(0, this.maxTintRegions);

      this.f.msg_void_bool(fullTint, this.sel("setHidden:"), 1);
      for (let i = 0; i < regions.length; i++) {
        const view = this.ensureTintRegion(effectView, i);
        this.setTintView(view, this.nsRect(regions[i]), cgColor, false);
      }
      this.hideTintRegions(effectView, regions.length);
      return true;
    } catch (error) {
      plugin.log("native tint region update failed: " + error);
      return false;
    }
  },

  ensureTintRegion(effectView, index) {
    const identifier = "ZoteroGlassTintRegion" + index;
    let view = this.findSubviewWithIdentifier(effectView, identifier);
    if (!this.isNil(view)) {
      return view;
    }

    view = this.f.msg_id_rect(
      this.f.msg_id(this.cls("NSView"), this.sel("alloc")),
      this.sel("initWithFrame:"),
      this.nsRect({ x: 0, y: 0, width: 0, height: 0 })
    );
    this.f.msg_void_id(view, this.sel("setIdentifier:"), this.nsString(identifier));
    this.f.msg_void_bool(view, this.sel("setWantsLayer:"), 1);
    this.f.msg_void_id(effectView, this.sel("addSubview:"), view);
    return view;
  },

  setTintView(view, rect, cgColor, hidden) {
    if (this.isNil(view)) {
      return;
    }
    this.f.msg_void_rect(view, this.sel("setFrame:"), rect);
    this.f.msg_void_bool(view, this.sel("setHidden:"), hidden ? 1 : 0);
    const layer = this.f.msg_id(view, this.sel("layer"));
    this.f.msg_void_ptr(layer, this.sel("setBackgroundColor:"), cgColor);
  },

  hideTintRegions(effectView, startIndex) {
    for (let i = startIndex; i < this.maxTintRegions; i++) {
      const view = this.findSubviewWithIdentifier(effectView, "ZoteroGlassTintRegion" + i);
      if (!this.isNil(view)) {
        this.f.msg_void_bool(view, this.sel("setHidden:"), 1);
      }
    }
  },

  shutdown() {
    try {
      this.ZoteroGlassUninstall();
      if (this.appKit) {
        this.appKit.close();
      }
      if (this.objc) {
        this.objc.close();
      }
    } catch (error) {
      this.lastError = String(error);
    }
    this.available = false;
    this.objc = null;
    this.appKit = null;
  },

  status() {
    if (this.available) {
      return {
        ok: true,
        message: "原生 NSVisualEffectView 已启用",
        code: this.lastCode,
        libraryPath: "libobjc.A.dylib + AppKit",
      };
    }
    return {
      ok: false,
      message: this.lastError || "原生桥接尚未启用",
      code: this.lastCode,
      libraryPath: this.libraryPath,
    };
  },

  openSystemLibraries() {
    this.objc = this.ctypes.open("/usr/lib/libobjc.A.dylib");
    try {
      this.appKit = this.ctypes.open("/System/Library/Frameworks/AppKit.framework/AppKit");
    } catch (error) {
      this.appKit = null;
    }
  },

  declareObjCRuntime() {
    const c = this.ctypes;
    const ID = c.voidptr_t;
    const SEL = c.voidptr_t;
    const BOOL = c.signed_char;
    const NSInteger = c.long;
    const NSUInteger = c.unsigned_long;
    const CGFloat = c.double;
    const NSPoint = c.StructType("NSPoint", [
      { x: CGFloat },
      { y: CGFloat },
    ]);
    const NSSize = c.StructType("NSSize", [
      { width: CGFloat },
      { height: CGFloat },
    ]);
    const NSRect = c.StructType("NSRect", [
      { origin: NSPoint },
      { size: NSSize },
    ]);

    this.types = { ID, SEL, BOOL, NSInteger, NSUInteger, CGFloat, NSPoint, NSSize, NSRect };
    this.f = {
      objc_getClass: this.objc.declare("objc_getClass", c.default_abi, ID, c.char.ptr),
      sel_registerName: this.objc.declare("sel_registerName", c.default_abi, SEL, c.char.ptr),
      msg_id: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL),
      msg_id_char: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL, c.char.ptr),
      msg_id_id: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL, ID),
      msg_id_ulong: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL, NSUInteger),
      msg_id_rect: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL, NSRect),
      msg_id_d4: this.objc.declare("objc_msgSend", c.default_abi, ID, ID, SEL, CGFloat, CGFloat, CGFloat, CGFloat),
      msg_bool_id: this.objc.declare("objc_msgSend", c.default_abi, BOOL, ID, SEL, ID),
      msg_bool_ulong: this.objc.declare("objc_msgSend", c.default_abi, BOOL, ID, SEL, NSUInteger),
      msg_double_ulong: this.objc.declare("objc_msgSend", c.default_abi, CGFloat, ID, SEL, NSUInteger),
      msg_ulong: this.objc.declare("objc_msgSend", c.default_abi, NSUInteger, ID, SEL),
      msg_void: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL),
      msg_void_bool: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, BOOL),
      msg_void_bool_ulong: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, BOOL, NSUInteger),
      msg_void_double_ulong: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, CGFloat, NSUInteger),
      msg_void_id: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, ID),
      msg_void_id_long_id: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, ID, NSInteger, ID),
      msg_void_long: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, NSInteger),
      msg_void_ulong: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, NSUInteger),
      msg_void_rect: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, NSRect),
      msg_void_ptr: this.objc.declare("objc_msgSend", c.default_abi, c.void_t, ID, SEL, c.voidptr_t),
    };
  },

  ZoteroGlassInstall() {
    const app = this.sharedApplication();
    if (this.isNil(app)) {
      return 2;
    }
    return 0;
  },

  ZoteroGlassApply(plugin, config) {
    const app = this.sharedApplication();
    if (this.isNil(app)) {
      return 2;
    }

    const windows = this.f.msg_id(app, this.sel("windows"));
    const count = Number(this.f.msg_ulong(windows, this.sel("count")));
    const rgb = plugin.hexToRgb(config.backgroundColor);
    const alpha = plugin.overlayAlphaForTransparency(config.backgroundTransparency);
    const material = this.materialForConfig(config);

    for (let i = 0; i < count; i++) {
      const window = this.f.msg_id_ulong(windows, this.sel("objectAtIndex:"), i);
      const isMainWindow = this.isZoteroMainWindow(window);
      this.applyToWindow(window, rgb, alpha, material);
      if (isMainWindow) {
        this.suppressContentBorders(window);
      }
    }
    return 0;
  },

  ZoteroGlassUninstall() {
    if (!this.f) {
      return 0;
    }
    const app = this.sharedApplication();
    if (this.isNil(app)) {
      return 2;
    }
    const windows = this.f.msg_id(app, this.sel("windows"));
    const count = Number(this.f.msg_ulong(windows, this.sel("count")));
    for (let i = 0; i < count; i++) {
      const window = this.f.msg_id_ulong(windows, this.sel("objectAtIndex:"), i);
      const contentView = this.f.msg_id(window, this.sel("contentView"));
      const effect = this.findSubviewWithIdentifier(contentView, "ZoteroGlassEffectView");
      if (!this.isNil(effect)) {
        this.f.msg_void(effect, this.sel("removeFromSuperview"));
      }
      this.restoreContentBorders(window);
    }
    this.contentBorderStates.clear();
    return 0;
  },

  applyToWindow(window, rgb, alpha, material) {
    if (this.isNil(window)) {
      return;
    }
    const contentView = this.f.msg_id(window, this.sel("contentView"));
    if (this.isNil(contentView)) {
      return;
    }

    this.f.msg_void_bool(window, this.sel("setOpaque:"), 0);
    this.f.msg_void_id(window, this.sel("setBackgroundColor:"), this.f.msg_id(this.cls("NSColor"), this.sel("clearColor")));
    this.f.msg_void_bool(window, this.sel("setTitlebarAppearsTransparent:"), 1);
    const styleMask = Number(this.f.msg_ulong(window, this.sel("styleMask")));
    this.f.msg_void_ulong(window, this.sel("setStyleMask:"), styleMask | 32768);

    let effectView = this.findSubviewWithIdentifier(contentView, "ZoteroGlassEffectView");
    if (this.isNil(effectView)) {
      effectView = this.f.msg_id_rect(
        this.f.msg_id(this.cls("NSVisualEffectView"), this.sel("alloc")),
        this.sel("initWithFrame:"),
        this.largeRect()
      );
      this.f.msg_void_id(effectView, this.sel("setIdentifier:"), this.nsString("ZoteroGlassEffectView"));
      this.f.msg_void_ulong(effectView, this.sel("setAutoresizingMask:"), 18);
      this.f.msg_void_bool(effectView, this.sel("setWantsLayer:"), 1);
      this.f.msg_void_id_long_id(
        contentView,
        this.sel("addSubview:positioned:relativeTo:"),
        effectView,
        -1,
        this.nil()
      );
    }

    this.f.msg_void_rect(effectView, this.sel("setFrame:"), this.largeRect());
    this.f.msg_void_long(effectView, this.sel("setMaterial:"), material);
    this.f.msg_void_long(effectView, this.sel("setBlendingMode:"), 0);
    this.f.msg_void_long(effectView, this.sel("setState:"), 1);
    this.f.msg_void_bool(effectView, this.sel("setEmphasized:"), 0);

    let tintView = this.findSubviewWithIdentifier(effectView, "ZoteroGlassTintView");
    if (this.isNil(tintView)) {
      tintView = this.f.msg_id_rect(
        this.f.msg_id(this.cls("NSView"), this.sel("alloc")),
        this.sel("initWithFrame:"),
        this.largeRect()
      );
      this.f.msg_void_id(tintView, this.sel("setIdentifier:"), this.nsString("ZoteroGlassTintView"));
      this.f.msg_void_ulong(tintView, this.sel("setAutoresizingMask:"), 18);
      this.f.msg_void_bool(tintView, this.sel("setWantsLayer:"), 1);
      this.f.msg_void_id(effectView, this.sel("addSubview:"), tintView);
    }
    this.f.msg_void_rect(tintView, this.sel("setFrame:"), this.largeRect());

    const tintColor = this.f.msg_id_d4(
      this.cls("NSColor"),
      this.sel("colorWithCalibratedRed:green:blue:alpha:"),
      rgb.red,
      rgb.green,
      rgb.blue,
      alpha
    );
    const layer = this.f.msg_id(tintView, this.sel("layer"));
    const cgColor = this.f.msg_id(tintColor, this.sel("CGColor"));
    this.f.msg_void_ptr(layer, this.sel("setBackgroundColor:"), cgColor);
    this.f.msg_void_bool(tintView, this.sel("setHidden:"), 0);
    this.hideTintRegions(effectView, 0);
  },

  findSubviewWithIdentifier(parent, identifier) {
    if (this.isNil(parent)) {
      return this.nil();
    }
    const target = this.nsString(identifier);
    const subviews = this.f.msg_id(parent, this.sel("subviews"));
    if (this.isNil(subviews)) {
      return this.nil();
    }
    const count = Number(this.f.msg_ulong(subviews, this.sel("count")));
    for (let i = 0; i < count; i++) {
      const subview = this.f.msg_id_ulong(subviews, this.sel("objectAtIndex:"), i);
      const actual = this.f.msg_id(subview, this.sel("identifier"));
      if (!this.isNil(actual) && this.f.msg_bool_id(actual, this.sel("isEqualToString:"), target)) {
        return subview;
      }
    }
    return this.nil();
  },

  sharedApplication() {
    return this.f.msg_id(this.cls("NSApplication"), this.sel("sharedApplication"));
  },

  nsString(value) {
    return this.f.msg_id_char(this.cls("NSString"), this.sel("stringWithUTF8String:"), String(value));
  },

  cls(name) {
    if (!this.classes[name]) {
      this.classes[name] = this.f.objc_getClass(name);
    }
    return this.classes[name];
  },

  sel(name) {
    if (!this.selectors[name]) {
      this.selectors[name] = this.f.sel_registerName(name);
    }
    return this.selectors[name];
  },

  nil() {
    return this.ctypes.voidptr_t(0);
  },

  isNil(pointer) {
    return !pointer || (typeof pointer.isNull === "function" && pointer.isNull());
  },

  largeRect() {
    return this.types.NSRect(
      this.types.NSPoint(0, 0),
      this.types.NSSize(10000, 10000)
    );
  },

  nsRect(rect) {
    return this.types.NSRect(
      this.types.NSPoint(rect.x, rect.y),
      this.types.NSSize(rect.width, rect.height)
    );
  },

  windowKey(window) {
    try {
      return String(window || "");
    } catch (error) {
      return "";
    }
  },

  suppressContentBorders(window) {
    const key = this.windowKey(window);
    if (!key) {
      return;
    }

    // NSWindow content-border APIs only support the bottom edge for a
    // non-textured window. Other NSRectEdge values can raise NSException.
    const edges = [1];

    if (!this.contentBorderStates.has(key)) {
      this.contentBorderStates.set(key, {
        window,
        edges: edges.map(edge => ({
          edge,
          automatic: Boolean(
            this.f.msg_bool_ulong(
              window,
              this.sel("autorecalculatesContentBorderThicknessForEdge:"),
              edge
            )
          ),
          thickness: Number(
            this.f.msg_double_ulong(
              window,
              this.sel("contentBorderThicknessForEdge:"),
              edge
            )
          ),
        })),
      });
    }

    for (const edge of edges) {
      this.f.msg_void_bool_ulong(
        window,
        this.sel("setAutorecalculatesContentBorderThickness:forEdge:"),
        0,
        edge
      );
      this.f.msg_void_double_ulong(
        window,
        this.sel("setContentBorderThickness:forEdge:"),
        0,
        edge
      );
    }
  },

  restoreContentBorders(window) {
    const key = this.windowKey(window);
    const state = key ? this.contentBorderStates.get(key) : null;
    if (!state) {
      return;
    }

    for (const edgeState of state.edges) {
      this.f.msg_void_double_ulong(
        window,
        this.sel("setContentBorderThickness:forEdge:"),
        edgeState.thickness,
        edgeState.edge
      );
      this.f.msg_void_bool_ulong(
        window,
        this.sel("setAutorecalculatesContentBorderThickness:forEdge:"),
        edgeState.automatic ? 1 : 0,
        edgeState.edge
      );
    }
    this.contentBorderStates.delete(key);
  },

  isZoteroMainWindow(window) {
    try {
      const title = this.f.msg_id(window, this.sel("title"));
      return !this.isNil(title) && Boolean(
        this.f.msg_bool_id(title, this.sel("isEqualToString:"), this.nsString("Zotero"))
      );
    } catch (error) {
      return false;
    }
  },

  importCtypes() {
    if (typeof ChromeUtils !== "undefined" && ChromeUtils?.importESModule) {
      const module = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
      if (module?.ctypes) {
        return module.ctypes;
      }
    }
    if (Components?.utils?.import) {
      const scope = {};
      Components.utils.import("resource://gre/modules/ctypes.jsm", scope);
      if (scope.ctypes) {
        return scope.ctypes;
      }
    }
    throw new Error("ctypes is not available in this Zotero plugin runtime");
  },

  isMac() {
    try {
      return Services.appinfo.OS === "Darwin";
    } catch (error) {
      return false;
    }
  },

  materialForConfig(config) {
    const materials = {
      window: 12,
      sidebar: 7,
      menu: 5,
      hud: 13,
      underWindow: 21,
    };
    if (config.glassMaterial && config.glassMaterial !== "auto") {
      return materials[config.glassMaterial] ?? 13;
    }

    const strength = Number(config.blurStrength);
    if (strength < 25) return materials.window;
    if (strength < 50) return materials.sidebar;
    if (strength < 75) return materials.underWindow;
    return materials.hud;
  },
};

var ZoteroGlass = {
  version: "0.2.47",
  pluginID: "zotero-glass@avi7ii.github.io",
  menuID: "zotero-glass-menuitem",
  separatorID: "zotero-glass-menuseparator",
  toolbarbuttonID: "zotero-glass-toolbarbutton",
  stylesheetID: "zotero-glass-stylesheet",
  preferencePaneID: "zotero-glass-preferences",
  preferencePaneRegistered: false,
  rootURI: null,
  globalSheetRegistered: false,
  globalSheetURI: null,
  configSheetURI: null,
  configSheetRegistered: false,
  readerRenderHandler: null,
  readerTabObserver: null,
  readerTabObserverID: null,
  stylePluginLifecycleObserver: null,
  styleTagIntegrationActive: false,
  styleRenderHooks: new Map(),
  styleTagBackgroundOpacity: 0.85,
  appShutdownReason: 2,
  previousToolbarTheme: null,
  defaults: {
    sidebarIndependent: true,
    styleTagBackgroundOpacity: 0.85,
    backgroundTransparency: 0.73,
    blurStrength: 92,
    backgroundColor: "#1A1A1A",
    glassMaterial: "auto",
    sidebar: {
      backgroundTransparency: 0.92,
      blurStrength: 100,
      backgroundColor: "#06090A",
      glassMaterial: "sidebar",
    },
  },
  get configPath() {
    const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
    return home + "/Library/Application Support/ZoteroGlass/config.json";
  },

  get logPath() {
    const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
    return home + "/Library/Logs/ZoteroGlassPlugin.log";
  },

  async startup(rootURI) {
    await Zotero.initializationPromise;
    this.rootURI = rootURI;
    Zotero.ZoteroGlass = this;
    this.forceDarkMode();
    this.ensureConfig();
    await this.registerPreferencePane();
    this.registerGlobalStylesheet();
    this.startStyleTagIntegration();
    this.addToAllWindows();
    const ok = NativeGlassBridge.init(this);
    this.log("started " + this.version + " native=" + ok);
    this.writeConfig(this.readConfig());
    this.startReaderLifecycleIntegration();
    Zotero.debug("Zotero Glass started");
  },

  shutdown() {
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      this.onMainWindowUnload(enumerator.getNext());
    }
    this.unregisterConfigStylesheet();
    this.unregisterGlobalStylesheet();
    this.stopReaderLifecycleIntegration();
    this.stopStyleTagIntegration();
    this.cleanupInjectedDocumentStyles();
    NativeGlassBridge.shutdown();
    this.restoreToolbarTheme();
    this.unregisterPreferencePane();
    if (Zotero.ZoteroGlass === this) {
      delete Zotero.ZoteroGlass;
    }
  },

  addToAllWindows() {
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      if (win?.document?.getElementById("zotero-pane")) {
        this.onMainWindowLoad(win);
      }
    }
  },

  onMainWindowLoad(win) {
    const doc = win.document;
    if (!doc?.getElementById("zotero-pane")) {
      return;
    }

    doc.documentElement.setAttribute("zotero-glass-active", "true");
    this.installStylesheet(doc);
    this.installMenuItem(win);
    this.installToolbarButton(win);
    this.applyConfig(this.readConfig());
    this.installStyleTagRenderHook(win);
    this.refreshVisibleStyleTags(doc);
  },

  onMainWindowUnload(win) {
    const doc = win?.document;
    doc?.documentElement?.removeAttribute("zotero-glass-active");
    doc?.documentElement?.removeAttribute("zotero-glass-reader-active");
    doc?.getElementById(this.menuID)?.remove();
    doc?.getElementById(this.separatorID)?.remove();
    doc?.getElementById(this.toolbarbuttonID)?.remove();
    doc?.getElementById(this.stylesheetID)?.remove();
    this.removeStyleTagRenderHook(win);
    this.cleanupDocumentStyles(doc);
  },

  installMenuItem(win) {
    const doc = win.document;
    if (doc.getElementById(this.menuID)) {
      return;
    }

    const popup = doc.getElementById("menu_ToolsPopup");
    if (!popup) {
      return;
    }

    const separator = this.createXULElement(doc, "menuseparator");
    separator.id = this.separatorID;

    const item = this.createXULElement(doc, "menuitem");
    item.id = this.menuID;
    item.setAttribute("label", "Zotero Glass 偏好设置...");
    item.addEventListener("command", () => this.openPreferences(win));

    const addons = doc.getElementById("menu_addons");
    const ref = addons?.nextSibling || popup.firstChild;
    popup.insertBefore(separator, ref);
    popup.insertBefore(item, ref);
    this.log("menu entry installed");
  },

  installToolbarButton(win) {
    const doc = win.document;
    if (doc.getElementById(this.toolbarbuttonID)) {
      return;
    }

    const button = this.createXULElement(doc, "toolbarbutton");
    button.id = this.toolbarbuttonID;
    button.setAttribute("label", "Zotero Glass");
    button.setAttribute("tooltiptext", "Zotero Glass 偏好设置");
    button.setAttribute("aria-label", "Zotero Glass 偏好设置");
    button.setAttribute("title", "Zotero Glass 偏好设置");
    button.setAttribute("image", "chrome://zotero-glass/content/zotero-glass.svg");
    button.setAttribute("class", "toolbarbutton-1");
    button.addEventListener("command", () => this.openPreferences(win));

    const host = this.findToolbarHost(doc);
    if (host) {
      const search = doc.getElementById("zotero-tb-search") || doc.querySelector('searchbox, input[type="search"]');
      if (search?.parentNode === host) {
        host.insertBefore(button, search);
      } else {
        host.appendChild(button);
      }
      this.log("toolbar entry installed in " + (host.id || host.localName));
      return;
    }

    this.log("toolbar host not found");
  },

  findToolbarHost(doc) {
    const ids = [
      "zotero-toolbar",
      "zotero-items-toolbar",
      "zotero-collections-toolbar",
      "zotero-tb-wrapper",
    ];
    for (const id of ids) {
      const node = doc.getElementById(id);
      if (node) {
        return node;
      }
    }
    return doc.querySelector("toolbar") || doc.querySelector('[role="toolbar"]');
  },

  installStylesheet(doc) {
    if (doc.getElementById(this.stylesheetID)) {
      return;
    }

    const pi = doc.createProcessingInstruction(
      "xml-stylesheet",
      'type="text/css" href="chrome://zotero-glass/content/glass.css"'
    );
    pi.id = this.stylesheetID;
    doc.insertBefore(pi, doc.documentElement);
  },

  registerGlobalStylesheet() {
    try {
      const service = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);
      const uri = Services.io.newURI("chrome://zotero-glass/content/glass.css");
      if (!service.sheetRegistered(uri, service.USER_SHEET)) {
        service.loadAndRegisterSheet(uri, service.USER_SHEET);
      }
      this.globalSheetURI = uri;
      this.globalSheetRegistered = true;
      this.log("global stylesheet registered");
    } catch (error) {
      this.globalSheetRegistered = false;
      this.log("global stylesheet registration failed: " + error);
    }
  },

  unregisterGlobalStylesheet() {
    try {
      if (!this.globalSheetURI) {
        return;
      }
      const service = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);
      if (service.sheetRegistered(this.globalSheetURI, service.USER_SHEET)) {
        service.unregisterSheet(this.globalSheetURI, service.USER_SHEET);
      }
      this.globalSheetRegistered = false;
      this.globalSheetURI = null;
    } catch (error) {
      this.log("global stylesheet unregister failed: " + error);
    }
  },

  registerConfigStylesheet(config) {
    this.unregisterConfigStylesheet();
    const next = this.sanitizeConfig(config);

    try {
      const service = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);
      const css = `
/* zotero-glass-config */
${this.readerSidebarGlassCSS(this.sidebarAppearanceConfig(next))}
`;
      const uri = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(css));
      service.loadAndRegisterSheet(uri, service.USER_SHEET);
      this.configSheetURI = uri;
      this.configSheetRegistered = true;
      this.log("config stylesheet registered sidebar=true");
    } catch (error) {
      this.configSheetURI = null;
      this.configSheetRegistered = false;
      this.log("config stylesheet registration failed: " + error);
    }
  },

  unregisterConfigStylesheet() {
    try {
      if (!this.configSheetURI) {
        return;
      }
      const service = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);
      if (service.sheetRegistered(this.configSheetURI, service.USER_SHEET)) {
        service.unregisterSheet(this.configSheetURI, service.USER_SHEET);
      }
      this.configSheetURI = null;
      this.configSheetRegistered = false;
    } catch (error) {
      this.log("config stylesheet unregister failed: " + error);
    }
  },

  readerSidebarGlassCSS(appearance) {
    const config = this.sanitizeAppearanceConfig(appearance, this.defaults.sidebar);
    const channels = this.cssRgbChannels(config.backgroundColor);
    const alpha = this.overlayAlphaForTransparency(config.backgroundTransparency);
    const strongAlpha = this.clamp(alpha + 0.055, 0.08, 0.72);
    const toolbarAlpha = this.clamp(alpha + 0.10, 0.14, 0.32);
    const borderAlpha = this.clamp(alpha + 0.06, 0.08, 0.58);
    const blur = Math.round(this.clamp(config.blurStrength, 0, 100) * 1.55);
    const saturation = (1.08 + this.clamp(config.blurStrength, 0, 100) / 100 * 0.52).toFixed(2);

    return `
:root {
  --zotero-glass-sidebar-rgb: ${channels};
  --zotero-glass-sidebar-bg: rgba(${channels}, ${alpha.toFixed(3)});
  --zotero-glass-sidebar-bg-strong: rgba(${channels}, ${strongAlpha.toFixed(3)});
  --zotero-glass-reader-toolbar-bg: rgba(${channels}, ${toolbarAlpha.toFixed(3)});
  --zotero-glass-sidebar-border: rgba(255, 255, 255, ${borderAlpha.toFixed(3)});
  --zotero-glass-sidebar-blur: ${blur}px;
  --zotero-glass-sidebar-saturate: ${saturation};
  --material-background: rgba(${channels}, ${this.clamp(alpha - 0.06, 0.04, 0.5).toFixed(3)}) !important;
  --material-stripe: rgba(255, 255, 255, 0.03) !important;
  --material-sidepane: var(--zotero-glass-sidebar-bg) !important;
  --material-toolbar: var(--zotero-glass-sidebar-bg-strong) !important;
  --material-panedivider: 1px solid var(--zotero-glass-sidebar-border) !important;
  --color-panedivider: var(--zotero-glass-sidebar-border) !important;
  --color-scrollbar-background: rgba(0, 0, 0, 0.10) !important;
}

html,
body,
#root,
#reader,
#reader-ui,
#outerContainer,
#mainContainer,
#split-view,
.split-view {
  background-color: transparent !important;
  background-image: none !important;
}

:root[zotero-glass-active="true"] #zotero-collections-pane,
:root[zotero-glass-active="true"] #zotero-item-pane,
:root[zotero-glass-active="true"] #zotero-context-pane,
:root[zotero-glass-active="true"] #zotero-item-pane-content,
#reader #sidebarContainer,
#reader #sidebarContent,
#reader #sidebarContainer .sidebar-toolbar,
#reader #thumbnailView,
#reader #thumbnailsView,
#reader #outlineView,
#reader #annotationsView,
#reader #annotationsView .annotations,
#reader #annotationsView .selector,
#reader .reader-sidebar,
#reader .viewWrapper,
#reader .thumbnails-view,
#reader .outline-view,
#reader-ui #sidebarContainer,
#reader-ui #sidebarContent,
#reader-ui #sidebarContainer .sidebar-toolbar,
#reader-ui #thumbnailView,
#reader-ui #thumbnailsView,
#reader-ui #outlineView,
#reader-ui #annotationsView,
#reader-ui #annotationsView .annotations,
#reader-ui #annotationsView .selector,
#reader-ui #item-pane,
#reader-ui #context-pane,
#reader-ui #context-pane-inner,
#reader-ui .zotero-context-pane,
#reader-ui .zotero-context-pane-inner,
#reader-ui .zotero-context-panes-deck,
#reader-ui .reader-sidebar,
#reader-ui .context-pane,
#reader-ui .item-pane,
#reader-ui .metadata-pane,
#reader-ui .viewWrapper,
.split-view #item-pane,
.split-view #context-pane,
.split-view #context-pane-inner,
.split-view .reader-sidebar,
.split-view .context-pane,
.split-view .item-pane,
.split-view .metadata-pane,
.split-view .viewWrapper {
  -moz-appearance: none !important;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.012)),
    var(--zotero-glass-sidebar-bg) !important;
  border-color: var(--zotero-glass-sidebar-border) !important;
  backdrop-filter: blur(var(--zotero-glass-sidebar-blur)) saturate(var(--zotero-glass-sidebar-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--zotero-glass-sidebar-blur)) saturate(var(--zotero-glass-sidebar-saturate)) !important;
}

#reader #thumbnailView,
#reader-ui #thumbnailView,
#reader #thumbnailsView,
#reader-ui #thumbnailsView,
#reader #outlineView,
#reader-ui #outlineView,
#reader #annotationsView,
#reader-ui #annotationsView,
#reader-ui #item-pane,
#reader-ui #context-pane,
#reader-ui .context-pane,
#reader-ui .item-pane,
#reader-ui .metadata-pane,
.split-view #item-pane,
.split-view #context-pane,
.split-view .context-pane,
.split-view .item-pane,
.split-view .metadata-pane {
  box-shadow:
    inset 1px 0 rgba(255, 255, 255, 0.045),
    inset -1px 0 rgba(0, 0, 0, 0.24) !important;
}

#reader #sidebarContainer,
#reader-ui #sidebarContainer,
body.sidebar-open #sidebarContainer {
  background: transparent !important;
  background-image: none !important;
  border-color: var(--zotero-glass-sidebar-border) !important;
  backdrop-filter: blur(var(--zotero-glass-sidebar-blur)) saturate(var(--zotero-glass-sidebar-saturate)) !important;
  -webkit-backdrop-filter: blur(var(--zotero-glass-sidebar-blur)) saturate(var(--zotero-glass-sidebar-saturate)) !important;
}

#reader #sidebarContent,
#reader-ui #sidebarContent,
#reader #sidebarContainer .sidebar-toolbar,
#reader-ui #sidebarContainer .sidebar-toolbar,
#reader #sidebarContent .viewWrapper,
#reader-ui #sidebarContent .viewWrapper,
#reader #thumbnailView,
#reader-ui #thumbnailView,
#reader #thumbnailsView,
#reader-ui #thumbnailsView,
#reader #outlineView,
#reader-ui #outlineView,
#reader #annotationsView,
#reader-ui #annotationsView,
#reader #annotationsView .annotations,
#reader-ui #annotationsView .annotations,
#reader #annotationsView .selector,
#reader-ui #annotationsView .selector {
  background: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

#reader-ui #context-pane *,
#reader-ui #item-pane *,
.split-view #context-pane *,
.split-view #item-pane * {
  --material-sidepane: transparent !important;
  --material-background: rgba(${channels}, ${this.clamp(alpha - 0.08, 0.035, 0.42).toFixed(3)}) !important;
}

#reader #sidebarContainer *,
#reader-ui #sidebarContainer *,
#reader-ui #item-pane *,
#reader-ui #context-pane *,
#reader-ui .context-pane *,
#reader-ui .item-pane *,
.split-view #item-pane *,
.split-view #context-pane * {
  --material-background: transparent !important;
}

#reader-ui #item-pane section,
#reader-ui #context-pane section,
#reader-ui .metadata-pane section,
#reader-ui .item-pane section,
.split-view #item-pane section,
.split-view #context-pane section {
  background-color: transparent !important;
}

/* unified-reader-glass */
#reader-ui,
#reader-ui #sidebarContainer,
#reader-ui #sidebarContent,
#reader-ui #sidebarContainer .sidebar-toolbar,
#reader-ui #sidebarContent .viewWrapper,
#reader-ui #thumbnailsView,
#reader-ui #outlineView,
#reader-ui #annotationsView,
#reader-ui #split-view,
#reader-ui .split-view,
#reader-ui .primary-view,
#reader-ui .secondary-view,
#reader-ui #item-pane,
#reader-ui #context-pane,
#reader-ui #context-pane-inner,
#reader-ui .context-pane,
#reader-ui .item-pane,
#reader-ui .metadata-pane,
#viewerContainer,
#viewer,
.pdfViewer {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

#reader-ui > .toolbar,
#reader > .toolbar {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.008)),
    var(--zotero-glass-reader-toolbar-bg) !important;
  background-color: var(--zotero-glass-reader-toolbar-bg) !important;
  border-bottom: 1px solid var(--zotero-glass-sidebar-border) !important;
  backdrop-filter: blur(42px) saturate(1.45) !important;
  -webkit-backdrop-filter: blur(42px) saturate(1.45) !important;
}
`;
  },

  injectReaderSidebarGlassStyle(doc, config = this.readConfig()) {
    if (!doc?.documentElement || !this.isZoteroOrReaderDocument(doc)) {
      return false;
    }

    try {
      doc.documentElement.setAttribute("zotero-glass-active", "true");
      const css = this.readerSidebarGlassCSS(this.sidebarAppearanceConfig(config));
      let style = doc.getElementById("zotero-glass-reader-sidebar-style");
      if (!style) {
        style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
        style.id = "zotero-glass-reader-sidebar-style";
        const host = doc.head || doc.documentElement;
        host.appendChild(style);
      }
      if (style.textContent !== css) {
        style.textContent = css;
      }
      return true;
    } catch (error) {
      this.log("reader sidebar style injection failed: " + error);
      return false;
    }
  },

  preferenceAPI() {
    return {
      defaults: this.defaults,
      nativeStatus: () => this.nativeStatus(),
      readConfig: () => this.readConfigWithStatus(),
      writeConfig: config => this.writeConfig(config),
      resetConfig: () => this.writeConfig(this.defaults),
      applyCurrent: () => this.applyConfig(this.readConfig()),
    };
  },

  async registerPreferencePane() {
    if (this.preferencePaneRegistered || !this.rootURI) {
      return this.preferencePaneRegistered;
    }
    try {
      const stalePane = Zotero.PreferencePanes.pluginPanes?.find(
        pane => pane.id === this.preferencePaneID && pane.pluginID === this.pluginID
      );
      if (stalePane) {
        Zotero.PreferencePanes.unregister(stalePane.id);
        this.log("stale preference pane registration removed: " + stalePane.id);
      }
      await Zotero.PreferencePanes.register({
        pluginID: this.pluginID,
        id: this.preferencePaneID,
        label: "Glass",
        image: this.rootURI + "chrome/content/zotero-glass.svg",
        src: this.rootURI + "chrome/content/preferences.xhtml",
      });
      this.preferencePaneRegistered = true;
      this.log("preference pane registered: " + this.preferencePaneID);
      return true;
    } catch (error) {
      this.preferencePaneRegistered = false;
      this.log("preference pane registration failed: " + error);
      return false;
    }
  },

  unregisterPreferencePane() {
    const pane = Zotero.PreferencePanes.pluginPanes?.find(
      candidate =>
        candidate.id === this.preferencePaneID && candidate.pluginID === this.pluginID
    );
    if (pane) {
      Zotero.PreferencePanes.unregister(pane.id);
      this.log("preference pane unregistered: " + pane.id);
    }
    this.preferencePaneRegistered = false;
  },

  openPreferences() {
    Zotero.Utilities.Internal.openPreferences(this.preferencePaneID);
  },

  startReaderLifecycleIntegration() {
    if (this.readerRenderHandler) {
      return;
    }
    try {
      this.readerRenderHandler = () => {
        try {
          this.applyReaderDocumentPreferences();
        } catch (error) {
          this.log("reader render integration failed: " + error);
        }
      };
      Zotero.Reader.registerEventListener(
        "renderToolbar",
        this.readerRenderHandler,
        this.pluginID
      );

      this.readerTabObserver = {
        notify: (_event, type) => {
          if (type === "tab") {
            this.syncReaderNativeTintCutout();
          }
        },
      };
      this.readerTabObserverID = Zotero.Notifier.registerObserver(
        this.readerTabObserver,
        ["tab"],
        "zotero-glass-reader-tabs"
      );
      this.log("reader lifecycle integration started");
    } catch (error) {
      this.readerRenderHandler = null;
      this.readerTabObserver = null;
      this.readerTabObserverID = null;
      this.log("reader lifecycle integration start failed: " + error);
    }
  },

  stopReaderLifecycleIntegration() {
    try {
      if (this.readerRenderHandler) {
        // Zotero 9.0.6's public unregister method removes unrelated listeners.
        // Use the same plugin-ID cleanup path Zotero invokes during add-on shutdown.
        Zotero.Reader?._unregisterEventListenerByPluginID?.(this.pluginID);
      }
      if (this.readerTabObserverID) {
        Zotero.Notifier.unregisterObserver(this.readerTabObserverID);
      }
      this.log("reader lifecycle integration stopped");
    } catch (error) {
      this.log("reader lifecycle integration stop failed: " + error);
    }
    this.readerRenderHandler = null;
    this.readerTabObserver = null;
    this.readerTabObserverID = null;
  },

  startStyleTagIntegration() {
    this.styleTagIntegrationActive = true;
    if (!this.stylePluginLifecycleObserver) {
      this.stylePluginLifecycleObserver = {
        startup: ({ id }) => {
          if (this.isStylePluginID(id)) {
            this.refreshStyleTagIntegration("style-startup");
          }
        },
      };
      Zotero.Plugins.addObserver(this.stylePluginLifecycleObserver);
    }
    this.refreshStyleTagIntegration("glass-startup");
  },

  stopStyleTagIntegration() {
    this.styleTagIntegrationActive = false;
    if (this.stylePluginLifecycleObserver) {
      Zotero.Plugins.removeObserver(this.stylePluginLifecycleObserver);
      this.stylePluginLifecycleObserver = null;
    }
    for (const [prototype, hook] of this.styleRenderHooks) {
      if (prototype?._renderCell === hook.wrapper) {
        prototype._renderCell = hook.original;
      }
    }
    this.styleRenderHooks.clear();
    this.log("Style tag render integration stopped");
  },

  isStylePluginID(id) {
    return String(id || "").toLowerCase().includes("zoterostyle");
  },

  styleTagKindForDataKey(dataKey) {
    const key = String(dataKey || "").toLowerCase();
    if (key.endsWith("-status")) {
      return "status";
    }
    if (key.endsWith("-texttags")) {
      return "textTags";
    }
    if (key.endsWith("-publicationtags")) {
      return "publicationTags";
    }
    return null;
  },

  installStyleTagRenderHook(win) {
    let prototype = null;
    try {
      prototype = win?.require?.("zotero/itemTree")?.prototype;
    } catch (error) {
      this.log("Style item-tree module unavailable: " + error);
    }
    const original = prototype?._renderCell;
    if (!prototype || typeof original !== "function") {
      return false;
    }

    const current = this.styleRenderHooks.get(prototype);
    if (current?.wrapper === original) {
      return true;
    }

    const plugin = this;
    const wrapper = function (...args) {
      const cell = original.apply(this, args);
      if (!plugin.styleTagIntegrationActive) {
        return cell;
      }
      const column = args[2];
      const kind = plugin.styleTagKindForDataKey(column?.dataKey || column?.key);
      if (kind) {
        plugin.decorateStyleTagCell(kind, cell, args[1]);
      }
      return cell;
    };
    wrapper.__zoteroGlassStyleTagHook = true;
    prototype._renderCell = wrapper;
    this.styleRenderHooks.set(prototype, { original, wrapper });
    const tree = win?.ZoteroPane?.itemsView?.tree;
    if (typeof tree?.invalidate === "function") {
      tree.invalidate();
    }
    return true;
  },

  removeStyleTagRenderHook(win) {
    let prototype = null;
    try {
      prototype = win?.require?.("zotero/itemTree")?.prototype;
    } catch (error) {
      return false;
    }
    const hook = prototype && this.styleRenderHooks.get(prototype);
    if (!hook) {
      return false;
    }
    if (prototype._renderCell === hook.wrapper) {
      prototype._renderCell = hook.original;
    }
    this.styleRenderHooks.delete(prototype);
    return true;
  },

  refreshStyleTagIntegration(trigger = "manual") {
    if (!this.styleTagIntegrationActive) {
      return { windows: 0, hooks: 0, cells: 0 };
    }
    const result = { windows: 0, hooks: 0, cells: 0 };
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      const doc = win?.document;
      if (!doc?.getElementById("zotero-pane")) {
        continue;
      }
      result.windows += 1;
      if (this.installStyleTagRenderHook(win)) {
        result.hooks += 1;
      }
      result.cells += this.refreshVisibleStyleTags(doc);
    }
    this.log(
      "Style tag integration after " + trigger +
      ": windows=" + result.windows +
      " hooks=" + result.hooks +
      " cells=" + result.cells
    );
    return result;
  },

  refreshVisibleStyleTags(doc) {
    if (!doc?.getElementById("zotero-items-tree")) {
      return 0;
    }
    let touched = 0;
    for (const [kind, selector] of [
      ["status", "#zotero-items-tree .cell.zoterostyle-status"],
      ["textTags", "#zotero-items-tree .cell.zoterostyle-textTags"],
      ["publicationTags", "#zotero-items-tree .cell.zoterostyle-publicationTags"],
    ]) {
      for (const cell of Array.from(doc.querySelectorAll(selector))) {
        touched += this.decorateStyleTagCell(kind, cell);
      }
    }
    return touched;
  },

  decorateStyleTagCell(kind, cell, data = "") {
    if (!cell) {
      return 0;
    }
    if (kind === "status") {
      return this.solidifyStyleStatusCell(cell, data) ? 1 : 0;
    } else if (kind === "textTags") {
      return this.solidifyStyleTextTagCell(cell, true);
    } else if (kind === "publicationTags") {
      return this.solidifyStyleTextTagCell(cell, false);
    }
    return 0;
  },

  applyReaderDocumentPreferences(config = this.readConfig()) {
    const next = this.sanitizeConfig(config);
    let touched = 0;
    this.forEachOpenDocument(doc => {
      if (this.injectReaderSidebarGlassStyle(doc, next)) {
        touched += 1;
      }
    });
    this.syncReaderNativeTintCutout(next);
    return touched;
  },

  syncReaderNativeTintCutout(config = this.readConfig()) {
    const geometry = this.readerGlassGeometry();
    return NativeGlassBridge.applyTintRegions(
      this,
      geometry,
      this.appearanceConfig(config)
    );
  },

  readerGlassGeometry() {
    let geometry = null;
    this.forEachOpenDocument(doc => {
      if (geometry || !this.isReaderDocument(doc)) {
        return;
      }

      const reader = doc.getElementById("reader-ui") || doc.body || doc.documentElement;
      const translated = this.elementRectInTopWindow(reader);
      if (!translated) {
        return;
      }

      const top = this.clamp(translated.rect.y, 0, translated.viewport.height);
      geometry = {
        width: translated.viewport.width,
        height: translated.viewport.height,
        cutouts: [{
          x: 0,
          y: top,
          width: translated.viewport.width,
          height: translated.viewport.height - top,
        }],
      };
    });

    this.setReaderGlassActive(Boolean(geometry));
    return geometry || { width: 1, height: 1, cutouts: [] };
  },

  setReaderGlassActive(active) {
    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      const doc = enumerator.getNext()?.document;
      if (!doc?.getElementById("zotero-pane")) {
        continue;
      }
      if (active) {
        doc.documentElement.setAttribute("zotero-glass-reader-active", "true");
      } else {
        doc.documentElement.removeAttribute("zotero-glass-reader-active");
      }
    }
  },

  elementRectInTopWindow(element) {
    if (!element?.ownerDocument?.defaultView) {
      return null;
    }

    try {
      const local = element.getBoundingClientRect();
      if (local.width < 1 || local.height < 1) {
        return null;
      }

      let x = local.x;
      let y = local.y;
      let currentWindow = element.ownerDocument.defaultView;
      while (currentWindow?.frameElement) {
        const frame = currentWindow.frameElement;
        const frameRect = frame.getBoundingClientRect();
        const frameStyle = frame.ownerDocument?.defaultView?.getComputedStyle?.(frame);
        if (
          frameRect.width < 1 ||
          frameRect.height < 1 ||
          frame.hidden ||
          frame.getAttribute?.("hidden") === "true" ||
          frame.getAttribute?.("collapsed") === "true" ||
          frameStyle?.display === "none" ||
          frameStyle?.visibility === "hidden"
        ) {
          return null;
        }
        x += frameRect.x;
        y += frameRect.y;
        currentWindow = frame.ownerDocument.defaultView;
      }

      const width = Number(currentWindow?.innerWidth || 0);
      const height = Number(currentWindow?.innerHeight || 0);
      if (width < 1 || height < 1) {
        return null;
      }

      const left = this.clamp(x, 0, width);
      const top = this.clamp(y, 0, height);
      const right = this.clamp(x + local.width, 0, width);
      const bottom = this.clamp(y + local.height, 0, height);
      if (right - left < 1 || bottom - top < 1) {
        return null;
      }

      return {
        rect: {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        },
        viewport: { width, height },
      };
    } catch (error) {
      return null;
    }
  },

  tintRegionsForCutouts(fullRect, cutouts) {
    let regions = [fullRect];
    for (const cutout of cutouts || []) {
      regions = regions.flatMap(region => this.subtractRect(region, cutout));
    }
    return regions.filter(region => region.width > 0 && region.height > 0);
  },

  subtractRect(rect, hole) {
    const left = Math.max(rect.x, hole.x);
    const bottom = Math.max(rect.y, hole.y);
    const right = Math.min(rect.x + rect.width, hole.x + hole.width);
    const top = Math.min(rect.y + rect.height, hole.y + hole.height);
    if (left >= right || bottom >= top) {
      return [rect];
    }

    return [
      { x: rect.x, y: rect.y, width: rect.width, height: bottom - rect.y },
      { x: rect.x, y: top, width: rect.width, height: rect.y + rect.height - top },
      { x: rect.x, y: bottom, width: left - rect.x, height: top - bottom },
      { x: right, y: bottom, width: rect.x + rect.width - right, height: top - bottom },
    ].filter(region => region.width > 0 && region.height > 0);
  },

  solidifyStyleStatusCell(cell, data = "") {
    const inner = cell.querySelector?.(".inner");
    const chip = inner?.parentElement || cell.firstElementChild;
    if (!chip || chip === cell) {
      return false;
    }

    const sourceColor = this.styleStatusColorFromData(data) ||
      this.styleBackgroundFromNode(chip);
    const palette = this.styleTagPalette(sourceColor);
    if (!palette) {
      return false;
    }

    chip.style?.setProperty("background-color", palette.background, "important");
    chip.style?.setProperty("color", palette.foreground, "important");

    for (const label of Array.from(chip.querySelectorAll?.("span") || [])) {
      label.style.setProperty("color", palette.foreground, "important");
    }
    for (const dot of Array.from(chip.querySelectorAll?.(".circle > div") || [])) {
      dot.style.setProperty("background-color", "#FFFFFF", "important");
    }
    return true;
  },

  solidifyStyleTextTagCell(cell, forceReadableText = false) {
    let solidified = 0;
    for (const chip of Array.from(cell.querySelectorAll?.("span") || [])) {
      if (!String(chip.textContent || "").trim() || !chip.style?.backgroundColor) {
        continue;
      }
      const palette = this.styleTagPalette(chip.style.backgroundColor);
      if (!palette) {
        continue;
      }
      chip.style.setProperty("background-color", palette.background, "important");
      if (forceReadableText) {
        chip.style.setProperty("color", palette.foreground, "important");
        chip.style.setProperty("opacity", "1", "important");
      }
      solidified += 1;
    }
    return solidified;
  },

  styleBackgroundFromNode(node) {
    const inline = node?.style?.backgroundColor || node?.style?.background || "";
    return this.styleTagPalette(inline) ? inline : "";
  },

  styleStatusColorFromData(data) {
    try {
      const payload = String(data || "").split("\n").slice(1).join("\n");
      const parsed = JSON.parse(payload);
      return typeof parsed?.color === "string" ? parsed.color : "";
    } catch (error) {
      return "";
    }
  },

  styleTagPalette(background) {
    const value = String(background || "").trim();
    const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    const match = value.match(
      /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)/i
    );
    if (!hex && !match) {
      return null;
    }

    const rgb = hex
      ? (hex[1].length === 3
          ? hex[1].split("").map(channel => parseInt(channel + channel, 16))
          : hex[1].match(/.{2}/g).map(channel => parseInt(channel, 16)))
      : match.slice(1, 4).map(channel =>
          this.clamp(Math.round(Number(channel)), 0, 255)
        );
    const linear = rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    const darkText = luminance >= 0.42;
    return {
      background: `rgba(${rgb.join(", ")}, ${this.styleTagBackgroundOpacity})`,
      foreground: darkText ? "#111418" : "#FFFFFF",
      border: darkText ? "rgba(0, 0, 0, 0.34)" : "rgba(255, 255, 255, 0.34)",
      rgb,
    };
  },

  forEachOpenDocument(callback) {
    const seen = new Set();
    const visitWindow = win => {
      let doc = null;
      try {
        doc = win?.document;
      } catch (error) {
        return;
      }
      if (!doc || seen.has(doc)) {
        return;
      }
      seen.add(doc);
      callback(doc);

      let frames = [];
      try {
        frames = Array.from(doc.querySelectorAll("browser, iframe, frame"));
      } catch (error) {
        return;
      }
      for (const frame of frames) {
        try {
          visitWindow(frame.contentWindow);
        } catch (error) {
          // Remote or unloaded frames are normal while the reader is opening.
        }
      }
    };

    const enumerator = Services.wm.getEnumerator(null);
    while (enumerator.hasMoreElements()) {
      visitWindow(enumerator.getNext());
    }
  },

  isReaderDocument(doc) {
    try {
      return Boolean(
        String(doc?.location?.href || "").startsWith("resource://zotero/reader/reader.html") ||
        doc.getElementById("reader") ||
        doc.getElementById("reader-ui") ||
        doc.getElementById("viewerContainer") ||
        doc.querySelector(".pdfViewer") ||
        doc.querySelector(".primary-view, .secondary-view, .reader-sidebar")
      );
    } catch (error) {
      return false;
    }
  },

  isZoteroOrReaderDocument(doc) {
    return Boolean(
      this.isReaderDocument(doc) ||
      doc.getElementById("zotero-pane") ||
      doc.getElementById("zotero-items-tree") ||
      doc.getElementById("zotero-collections-pane") ||
      doc.getElementById("zotero-item-pane") ||
      doc.getElementById("zotero-context-pane")
    );
  },

  ensureConfig() {
    const file = this.fileForPath(this.configPath);
    if (!file.exists()) {
      this.writeConfig(this.defaults);
    }
  },

  readConfigWithStatus() {
    const config = this.readConfig();
    return { ...config, nativeStatus: this.nativeStatus() };
  },

  readConfig() {
    const file = this.fileForPath(this.configPath);
    if (!file.exists()) {
      return { ...this.defaults };
    }

    try {
      const stream = Cc["@mozilla.org/network/file-input-stream;1"]
        .createInstance(Ci.nsIFileInputStream);
      const converter = Cc["@mozilla.org/intl/converter-input-stream;1"]
        .createInstance(Ci.nsIConverterInputStream);
      stream.init(file, 0x01, 0, 0);
      converter.init(stream, "UTF-8", 0, 0);

      let data = "";
      const chunk = {};
      while (converter.readString(0xffffffff, chunk) !== 0) {
        data += chunk.value;
      }
      converter.close();

      return this.sanitizeConfig(JSON.parse(data));
    } catch (error) {
      this.log("config read failed: " + error);
      return { ...this.defaults };
    }
  },

  writeConfig(config) {
    const next = this.sanitizeConfig(config);
    const file = this.fileForPath(this.configPath);
    this.ensureDirectory(file.parent);

    const data = JSON.stringify(next, null, 2) + "\n";
    const stream = Cc["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Ci.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x20, 0o644, 0);
    stream.write(data, data.length);
    stream.close();
    const nativeStatus = this.applyConfig(next);
    this.log("config saved " + data.replace(/\s+/g, " ").trim());
    return { ...next, nativeStatus };
  },

  sanitizeConfig(config) {
    const migrated = this.migrateConfig(config || {});
    const appearance = this.sanitizeAppearanceConfig(migrated, this.defaults);
    return {
      sidebarIndependent: migrated.sidebarIndependent === true,
      styleTagBackgroundOpacity: this.clamp(
        migrated.styleTagBackgroundOpacity,
        0.2,
        1
      ),
      ...appearance,
      sidebar: this.sanitizeAppearanceConfig(migrated.sidebar, this.defaults.sidebar),
    };
  },

  migrateConfig(config) {
    const migrated = {
      ...this.defaults,
      ...(config.dark || {}),
      ...config,
      sidebar: {
        ...this.defaults.sidebar,
        ...(config.sidebar?.dark || config.sidebar || {}),
      },
    };

    if (typeof config.tintAlpha === "number" && typeof config.backgroundTransparency !== "number") {
      migrated.backgroundTransparency = 1 - this.clamp(config.tintAlpha, 0, 0.8);
    }
    if (typeof config.blurRadius === "number" && typeof config.blurStrength !== "number") {
      migrated.blurStrength = Math.round(this.clamp(config.blurRadius, 0, 240) / 2.4);
    }
    if (
      typeof config.tintRed === "number" &&
      typeof config.tintGreen === "number" &&
      typeof config.tintBlue === "number" &&
      !config.backgroundColor
    ) {
      migrated.backgroundColor = this.rgbToHex(config.tintRed, config.tintGreen, config.tintBlue);
    }
    return migrated;
  },

  applyConfig(config) {
    const normalized = this.sanitizeConfig(config);
    this.styleTagBackgroundOpacity = normalized.styleTagBackgroundOpacity;
    const status = NativeGlassBridge.apply(this, this.appearanceConfig(normalized));
    this.registerConfigStylesheet(normalized);
    this.applyReaderDocumentPreferences(normalized);
    if (this.styleTagIntegrationActive) {
      this.refreshStyleTagIntegration("config-change");
    }
    this.log("native status ok=" + status.ok + " message=" + status.message);
    return status;
  },

  appearanceConfig(config) {
    const normalized = this.sanitizeConfig(config);
    return this.sanitizeAppearanceConfig(normalized, this.defaults);
  },

  sidebarAppearanceConfig(config) {
    const normalized = this.sanitizeConfig(config);
    if (!normalized.sidebarIndependent) {
      return this.appearanceConfig(normalized);
    }
    return normalized.sidebar || this.appearanceConfig(normalized);
  },

  sanitizeAppearanceConfig(config, fallback = this.defaults) {
    const migrated = { ...fallback, ...(config || {}) };
    return {
      backgroundTransparency: this.clamp(migrated.backgroundTransparency, 0.35, 0.92),
      blurStrength: Math.round(this.clamp(migrated.blurStrength, 0, 100)),
      backgroundColor: this.sanitizeColor(migrated.backgroundColor, fallback.backgroundColor),
      glassMaterial: ["auto", "window", "sidebar", "menu", "hud", "underWindow"].includes(migrated.glassMaterial)
        ? migrated.glassMaterial
        : fallback.glassMaterial,
    };
  },

  forceDarkMode() {
    try {
      if (this.previousToolbarTheme === null) {
        this.previousToolbarTheme = Services.prefs.prefHasUserValue("browser.theme.toolbar-theme")
          ? Services.prefs.getIntPref("browser.theme.toolbar-theme")
          : undefined;
      }
      Services.prefs.setIntPref("browser.theme.toolbar-theme", 0);
      this.log("Zotero dark mode enabled");
      return true;
    } catch (error) {
      this.log("Zotero dark mode enable failed: " + error);
      return false;
    }
  },

  restoreToolbarTheme() {
    try {
      if (this.previousToolbarTheme === undefined) {
        Services.prefs.clearUserPref("browser.theme.toolbar-theme");
      } else if (this.previousToolbarTheme !== null) {
        Services.prefs.setIntPref("browser.theme.toolbar-theme", this.previousToolbarTheme);
      }
      this.previousToolbarTheme = null;
    } catch (error) {
      this.log("Zotero theme restore failed: " + error);
    }
  },

  cleanupInjectedDocumentStyles() {
    this.forEachOpenDocument(doc => this.cleanupDocumentStyles(doc));
  },

  cleanupDocumentStyles(doc) {
    if (!doc?.documentElement) {
      return;
    }
    doc.documentElement.removeAttribute("zotero-glass-active");
    doc.documentElement.removeAttribute("zotero-glass-reader-active");
    doc.getElementById("zotero-glass-reader-sidebar-style")?.remove();
  },

  nativeStatus() {
    return NativeGlassBridge.status();
  },

  overlayAlphaForTransparency(transparency) {
    return this.clamp(1 - transparency, 0.06, 0.65);
  },

  hexToRgb(hex) {
    const clean = this.sanitizeColor(hex).replace("#", "");
    return {
      red: parseInt(clean.slice(0, 2), 16) / 255,
      green: parseInt(clean.slice(2, 4), 16) / 255,
      blue: parseInt(clean.slice(4, 6), 16) / 255,
    };
  },

  cssRgbChannels(hex) {
    const rgb = this.hexToRgb(hex);
    return [
      Math.round(rgb.red * 255),
      Math.round(rgb.green * 255),
      Math.round(rgb.blue * 255),
    ].join(", ");
  },

  rgbToHex(red, green, blue) {
    return (
      "#" +
      [red, green, blue]
        .map(value => Math.round(this.clamp(value, 0, 1) * 255).toString(16).padStart(2, "0"))
        .join("")
    ).toUpperCase();
  },

  sanitizeColor(value, fallback = this.defaults.backgroundColor) {
    const color = String(value || fallback).trim();
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : fallback;
  },

  clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(Math.max(number, min), max);
  },

  fileForPath(path) {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    return file;
  },

  ensureDirectory(dir) {
    if (!dir.exists()) {
      this.ensureDirectory(dir.parent);
      dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    }
  },

  createXULElement(doc, tag) {
    if (doc.createXULElement) {
      return doc.createXULElement(tag);
    }
    return doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tag);
  },

  log(message) {
    try {
      const file = this.fileForPath(this.logPath);
      const data = new Date().toISOString() + " " + message + "\n";
      const stream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);
      const converter = Cc["@mozilla.org/intl/converter-output-stream;1"]
        .createInstance(Ci.nsIConverterOutputStream);
      stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);
      converter.init(stream, "UTF-8", 0, 0);
      converter.writeString(data);
      converter.close();
    } catch (error) {
      Zotero.debug("Zotero Glass plugin log failed: " + error);
    }
  },
};

ZoteroGlass.preferences = {
  root: null,
  api: null,
  config: null,
  writeTimer: null,
  statusTimer: null,

  inputIDs: [
    "backgroundTransparency",
    "blurStrength",
    "backgroundColor",
    "styleTagBackgroundOpacity",
  ],

  sidebarInputMap: {
    sidebarBackgroundTransparency: "backgroundTransparency",
    sidebarBlurStrength: "blurStrength",
    sidebarBackgroundColor: "backgroundColor",
  },

  materialNames: {
    auto: "自动",
    hud: "HUD",
    underWindow: "窗口",
    sidebar: "侧边栏",
    menu: "菜单",
    window: "普通",
  },

  init(root) {
    try {
      return this._init(root);
    } catch (error) {
      ZoteroGlass.log(
        "preferences pane init failed: " + error +
        (error?.stack ? " stack=" + error.stack : "")
      );
      throw error;
    }
  },

  _init(root) {
    if (!root || root.getAttribute("data-initialized") === "true") {
      return;
    }
    root.setAttribute("data-initialized", "true");
    this.root = root;
    this.api = ZoteroGlass.preferenceAPI();
    root.addEventListener("showing", () => this.show(root));
    root.ownerDocument.documentElement.setAttribute(
      "zotero-glass-preferences-active",
      "true"
    );

    this.render(this.api.readConfig());
    for (const id of [...this.inputIDs, ...this.sidebarInputIDs()]) {
      const input = this.element(id);
      input.addEventListener("input", () => this.scheduleSave());
      input.addEventListener("change", () => this.scheduleSave());
    }
    this.element("sidebarIndependent").addEventListener("change", () => {
      this.scheduleSave();
    });
    for (const option of root.querySelectorAll(".material-option")) {
      option.addEventListener("click", () => {
        this.setMaterial(option.dataset.material);
        this.scheduleSave();
      });
    }
    this.element("reset").addEventListener("click", () => {
      this.render(this.api.resetConfig());
      this.setStatus("saved", "已恢复默认");
    });

    this.api.applyCurrent();
    ZoteroGlass.log("preferences pane initialized");
  },

  show(root) {
    if (!root) {
      return;
    }
    root.ownerDocument.documentElement.setAttribute(
      "zotero-glass-preferences-active",
      "true"
    );
    if (this.api) {
      this.render(this.api.readConfig());
      this.api.applyCurrent();
    }
  },

  sidebarInputIDs() {
    return Object.keys(this.sidebarInputMap);
  },

  element(id) {
    return this.root.querySelector(`#${id}`);
  },

  mergeDefaults(next) {
    const incoming = next || {};
    const merged = JSON.parse(JSON.stringify(this.api.defaults));
    Object.assign(merged, incoming);
    merged.sidebar = {
      ...this.api.defaults.sidebar,
      ...(incoming.sidebar || {}),
    };
    merged.sidebarIndependent = incoming.sidebarIndependent === true;
    return merged;
  },

  format(id, value) {
    if (id === "backgroundTransparency" || id === "styleTagBackgroundOpacity") {
      return `${Math.round(Number(value) * 100)}%`;
    }
    if (id === "blurStrength") {
      return `${Math.round(Number(value))}%`;
    }
    if (id === "backgroundColor") {
      return String(value).toUpperCase();
    }
    if (id === "glassMaterial") {
      return this.materialNames[value] || value;
    }
    return String(value);
  },

  setMaterial(value) {
    const material = this.materialNames[value] ? value : "auto";
    for (const option of this.root.querySelectorAll(".material-option")) {
      const selected = option.dataset.material === material;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-checked", selected ? "true" : "false");
    }
    this.element("glassMaterial-value").textContent = this.format(
      "glassMaterial",
      material
    );
  },

  getMaterial() {
    return (
      this.root.querySelector(".material-option.is-selected")?.dataset.material ||
      "auto"
    );
  },

  readControls() {
    for (const id of this.inputIDs) {
      const input = this.element(id);
      this.config[id] = input.type === "range" ? Number(input.value) : input.value;
    }
    this.config.glassMaterial = this.getMaterial();
    this.config.sidebarIndependent = this.element("sidebarIndependent").checked;
    for (const id of this.sidebarInputIDs()) {
      const input = this.element(id);
      const key = this.sidebarInputMap[id];
      this.config.sidebar[key] =
        input.type === "range" ? Number(input.value) : input.value;
    }
    return this.config;
  },

  render(next) {
    this.config = this.mergeDefaults(next);
    for (const id of this.inputIDs) {
      this.element(id).value = this.config[id];
      this.element(`${id}-value`).textContent = this.format(id, this.config[id]);
    }
    this.setMaterial(this.config.glassMaterial);
    this.element("sidebarIndependent").checked =
      this.config.sidebarIndependent === true;
    for (const id of this.sidebarInputIDs()) {
      const key = this.sidebarInputMap[id];
      this.element(id).value = this.config.sidebar[key];
      this.element(`${id}-value`).textContent = this.format(
        key,
        this.config.sidebar[key]
      );
    }
    this.updateSidebarEnabled();
  },

  renderValues() {
    this.readControls();
    for (const id of this.inputIDs) {
      this.element(`${id}-value`).textContent = this.format(id, this.config[id]);
    }
    this.element("glassMaterial-value").textContent = this.format(
      "glassMaterial",
      this.config.glassMaterial
    );
    for (const id of this.sidebarInputIDs()) {
      const key = this.sidebarInputMap[id];
      this.element(`${id}-value`).textContent = this.format(
        key,
        this.config.sidebar[key]
      );
    }
    this.updateSidebarEnabled();
  },

  updateSidebarEnabled() {
    const enabled = this.element("sidebarIndependent").checked;
    this.element("sidebarControls").classList.toggle("is-disabled", !enabled);
    this.element("sidebarIndependent-value").textContent = enabled ? "独立" : "跟随";
    for (const id of this.sidebarInputIDs()) {
      this.element(id).disabled = !enabled;
    }
  },

  setStatus(kind, text) {
    const node = this.element("apply-status");
    node.className = `status ${kind || ""}`.trim();
    node.textContent = text;
    clearTimeout(this.statusTimer);
  },

  saveNow() {
    try {
      this.renderValues();
      this.render(this.api.writeConfig(this.config));
      this.setStatus("saved", "已保存");
      this.statusTimer = setTimeout(() => this.setStatus("", "已就绪"), 1200);
    } catch (error) {
      this.setStatus("error", "保存失败");
      Zotero.logError(error);
    }
  },

  scheduleSave() {
    this.renderValues();
    this.setStatus("", "应用中");
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.saveNow(), 120);
  },
};
