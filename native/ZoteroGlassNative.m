#import <Cocoa/Cocoa.h>

static NSString *const ZoteroGlassEffectIdentifier = @"ZoteroGlassEffectView";
static NSString *const ZoteroGlassTintIdentifier = @"ZoteroGlassTintView";

static CGFloat gRed = 0.03;
static CGFloat gGreen = 0.035;
static CGFloat gBlue = 0.04;
static CGFloat gAlpha = 0.26;
static NSInteger gMaterialIndex = 3;
static NSInteger gBlendingIndex = 0;
static id gObserver = nil;

@interface ZoteroGlassWindowObserver : NSObject
@end

static NSVisualEffectMaterial ZoteroGlassMaterialForIndex(NSInteger index) {
  switch (index) {
    case 0:
      return NSVisualEffectMaterialWindowBackground;
    case 1:
      return NSVisualEffectMaterialSidebar;
    case 2:
      return NSVisualEffectMaterialMenu;
    case 3:
      return NSVisualEffectMaterialHUDWindow;
    case 4:
      if (@available(macOS 10.14, *)) {
        return NSVisualEffectMaterialUnderWindowBackground;
      }
      return NSVisualEffectMaterialHUDWindow;
    default:
      return NSVisualEffectMaterialHUDWindow;
  }
}

static NSVisualEffectBlendingMode ZoteroGlassBlendingForIndex(NSInteger index) {
  return index == 1 ? NSVisualEffectBlendingModeWithinWindow
                    : NSVisualEffectBlendingModeBehindWindow;
}

static NSView *ZoteroGlassSubviewWithIdentifier(NSView *view, NSString *identifier) {
  for (NSView *subview in view.subviews) {
    if ([subview.identifier isEqualToString:identifier]) {
      return subview;
    }
  }
  return nil;
}

static BOOL ZoteroGlassWindowLooksEligible(NSWindow *window) {
  if (!window || !window.contentView) {
    return NO;
  }
  if ((window.styleMask & NSWindowStyleMaskBorderless) == NSWindowStyleMaskBorderless) {
    return NO;
  }
  if (window.className && [window.className containsString:@"StatusItem"]) {
    return NO;
  }
  return YES;
}

static void ZoteroGlassApplyToWindow(NSWindow *window) {
  if (!ZoteroGlassWindowLooksEligible(window)) {
    return;
  }

  window.opaque = NO;
  window.backgroundColor = NSColor.clearColor;
  window.titlebarAppearsTransparent = YES;
  window.styleMask = window.styleMask | NSWindowStyleMaskFullSizeContentView;

  NSView *contentView = window.contentView;
  NSVisualEffectView *effectView =
      (NSVisualEffectView *)ZoteroGlassSubviewWithIdentifier(contentView, ZoteroGlassEffectIdentifier);
  if (!effectView) {
    effectView = [[NSVisualEffectView alloc] initWithFrame:contentView.bounds];
    effectView.identifier = ZoteroGlassEffectIdentifier;
    effectView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    effectView.wantsLayer = YES;
    [contentView addSubview:effectView positioned:NSWindowBelow relativeTo:nil];
  }

  effectView.frame = contentView.bounds;
  effectView.material = ZoteroGlassMaterialForIndex(gMaterialIndex);
  effectView.blendingMode = ZoteroGlassBlendingForIndex(gBlendingIndex);
  effectView.state = NSVisualEffectStateActive;
  effectView.emphasized = YES;

  NSView *tintView = ZoteroGlassSubviewWithIdentifier(effectView, ZoteroGlassTintIdentifier);
  if (!tintView) {
    tintView = [[NSView alloc] initWithFrame:effectView.bounds];
    tintView.identifier = ZoteroGlassTintIdentifier;
    tintView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    tintView.wantsLayer = YES;
    [effectView addSubview:tintView];
  }
  tintView.frame = effectView.bounds;
  tintView.layer.backgroundColor =
      [NSColor colorWithCalibratedRed:gRed green:gGreen blue:gBlue alpha:gAlpha].CGColor;
}

static void ZoteroGlassApplyToAllWindows(void) {
  for (NSWindow *window in NSApp.windows) {
    ZoteroGlassApplyToWindow(window);
  }
}

@implementation ZoteroGlassWindowObserver
- (void)windowDidChange:(NSNotification *)notification {
  NSWindow *window = notification.object;
  ZoteroGlassApplyToWindow(window);
}
@end

static void ZoteroGlassEnsureObserver(void) {
  if (gObserver) {
    return;
  }
  gObserver = [ZoteroGlassWindowObserver new];
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:gObserver
             selector:@selector(windowDidChange:)
                 name:NSWindowDidBecomeKeyNotification
               object:nil];
  [center addObserver:gObserver
             selector:@selector(windowDidChange:)
                 name:NSWindowDidBecomeMainNotification
               object:nil];
}

__attribute__((visibility("default"))) int ZoteroGlassInstall(void) {
  if (!NSApp) {
    return 2;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    ZoteroGlassEnsureObserver();
    ZoteroGlassApplyToAllWindows();
  });
  return 0;
}

__attribute__((visibility("default"))) int ZoteroGlassApply(double red,
                                                            double green,
                                                            double blue,
                                                            double alpha,
                                                            int material,
                                                            int blendingMode) {
  if (!NSApp) {
    return 2;
  }
  gRed = MAX(0.0, MIN(1.0, red));
  gGreen = MAX(0.0, MIN(1.0, green));
  gBlue = MAX(0.0, MIN(1.0, blue));
  gAlpha = MAX(0.0, MIN(0.95, alpha));
  gMaterialIndex = material;
  gBlendingIndex = blendingMode;

  dispatch_async(dispatch_get_main_queue(), ^{
    ZoteroGlassEnsureObserver();
    ZoteroGlassApplyToAllWindows();
  });
  return 0;
}

__attribute__((visibility("default"))) int ZoteroGlassUninstall(void) {
  if (!NSApp) {
    return 2;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    for (NSWindow *window in NSApp.windows) {
      NSView *contentView = window.contentView;
      NSView *effectView = ZoteroGlassSubviewWithIdentifier(contentView, ZoteroGlassEffectIdentifier);
      [effectView removeFromSuperview];
    }
  });
  return 0;
}
