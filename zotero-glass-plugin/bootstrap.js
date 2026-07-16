var chromeHandle;
var pluginScope;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "zotero-glass", rootURI + "chrome/content/"],
  ]);

  pluginScope = {
    rootURI,
    Zotero,
    Services,
    Components,
    ChromeUtils,
    Cc: Components.classes,
    Ci: Components.interfaces,
  };
  Services.scriptloader.loadSubScript(rootURI + "chrome/content/zoteroGlass.js", pluginScope);
  await pluginScope.ZoteroGlass.startup(rootURI);
}

async function onMainWindowLoad({ window }, reason) {
  pluginScope?.ZoteroGlass?.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  pluginScope?.ZoteroGlass?.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  pluginScope?.ZoteroGlass?.shutdown();
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) {}
