# Changelog

## 0.2.45 - 2026-07-16

- Removed Zotero's default bottom border from inactive tabs while preserving the vertical separators between tabs and the restrained active-tab surface.

## 0.2.44 - 2026-07-16

- Restored the standard macOS window shadow after confirming that it was not the source of the bright frame edge.
- Suppressed AppKit's automatically calculated content-border thickness on the main Zotero window while Glass is active, and restores every original edge value on shutdown.
- Removed the blue bottom accent from the active tab while retaining its raised glass surface, brighter text, and semibold title.

## 0.2.43 - 2026-07-16

- Replaced partial tab borders with full-height 1 px separators placed in the gap between adjacent tabs.
- Made the active tab identifiable through a restrained raised surface, blue bottom accent, brighter text, and a semibold title.
- Disabled the native shadow only for the main Zotero library window to remove the remaining full-window edge highlight, and restored it on plugin shutdown.

## 0.2.42 - 2026-07-16

- Restored a subtle 0.5 px divider between adjacent Zotero tabs instead of relying on Zotero's invalid self-referencing `--tab-border` value.
- Removed the white title-bar gradient and disabled the emphasized native material state that produced an unwanted highlight around the glass window.
- Preserved the standard macOS window shadow instead of disabling it globally.

## 0.2.41 - 2026-07-16

- Kept `#标签` text fully opaque and selected an accessible white or dark foreground from each tag's background color.
- Left publication-tag and status-tag text behavior unchanged.

## 0.2.40 - 2026-07-16

- Fixed the Style integration hook to use Zotero 9's real `zotero/itemTree` `_renderCell` lifecycle instead of a nonexistent custom element.
- Removed the destructive status-chip rewrite that cleared descendant backgrounds, borders, and shadows.
- Derived status colors from Style's rendered column data, including user-created status tags, while leaving Style's container, radius, and layout intact.
- Restored tags immediately after a hot install with one item-tree redraw that does not read, reset, register, or persist any columns.
- Made zero-alpha Style backgrounds recoverable so the shared opacity setting applies to status, `#标签`, and publication tags.

## 0.2.39 - 2026-07-16

- Removed all access to `Zotero.ItemTreeManager`, including its renderer cache, so Glass cannot participate in Style's column registration or layout persistence.
- Moved tag styling to the item-tree render lifecycle and added one immediate reconciliation pass for already-visible rows on install and settings changes.
- Applied the single tag-opacity control to status, `#标签`, and publication/journal tags.
- Replaced the cross-document CSS-variable color with concrete `rgba()` values and derived status colors from Style's rendered chips instead of hardcoded status names or colors.

## 0.2.38 - 2026-07-16

- Stopped touching Zotero's active item-tree column arrays or invalidating the table; Style chips are now integrated through renderer-cache wrapping only.
- Made tag-opacity changes propagate through a CSS variable, so changing opacity no longer requires a table refresh.
- Removed stale Glass preference-pane registrations during hot installs and shutdowns, and reduced the pane to Zotero's native fragment-loading path.
- Reduced the library column-header overlay to 2% opacity.

## 0.2.37 - 2026-07-16

- Made Ethereal Style `#标签`, `/done`, `/reading`, and `/unread` chip backgrounds default to a customizable 85% opacity while keeping text and dots fully opaque.
- Applied status colors to Style's existing rounded chip container and left its radius untouched instead of painting the rectangular inner label.
- Preserved every user-configured Zotero column by removing all column registration, refresh, snapshot, restore, and preference-writing behavior; Glass never manages which columns a user sees.
- Replaced fixed-interval UI repair scans with Zotero's item-tree, reader-render, and tab lifecycle events.
- Made Style integration follow the Style plugin lifecycle without timers.
- Added subtle 1 px white dividers between library columns for clearer separation on glass backgrounds.
- Added a native Glass entry to Zotero Settings and rebuilt the pane with a restrained translucent layout, automatic saving, and a live tag-opacity control.
- Reduced the library column-header overlay, matched the main tab bar to its previous glass tier, and removed the opaque strip from reader and web-reader toolbars.

## 0.2.36 - 2026-07-14

- Fixed installation on Zotero 9 by restoring the required plugin update URL.
- Added a signed-hash update manifest for GitHub Releases.

## 0.2.35 - 2026-07-14

- Added native macOS `NSVisualEffectView` glass without an external helper.
- Added glass styling for the Zotero library and PDF reader sidebars.
- Added configurable transparency, blur, tint color, and material.
- Added independent reader/sidebar appearance controls.
- Added readable translucent PDF annotation popups.
- Added toolbar and Tools-menu settings entries.
- Added optional Ethereal Style status-chip integration.
- Removed legacy profile repair behavior and invalid update placeholders.
- Added complete shutdown cleanup for injected styles and native views.
- Assigned the stable public add-on ID `zotero-glass@avi7ii.github.io`.
