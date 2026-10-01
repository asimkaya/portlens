//! The main window behaves like a tray flyout: it opens in the bottom-right
//! corner of the screen and closes as soon as it loses focus.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

pub const LABEL: &str = "main";

/// Logical size of the flyout. Tall and narrow, like the Windows quick panels.
const WIDTH: f64 = 400.0;
const HEIGHT: f64 = 660.0;
const MARGIN: f64 = 12.0;

/// Clicking the tray icon first takes focus from the flyout, which hides it,
/// and only then arrives as a click. Without a grace period that click would
/// open the flyout again straight after it closed.
const REOPEN_GUARD: Duration = Duration::from_millis(300);

/// Windows may hand focus around while a window is still appearing, which
/// would close the flyout the instant it opened.
const BLUR_GRACE: Duration = Duration::from_millis(500);

#[derive(Default)]
pub struct State {
    pinned: AtomicBool,
    last_shown: Mutex<Option<Instant>>,
    last_hidden: Mutex<Option<Instant>>,
}

pub fn show(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    place(app, &window);
    *app.state::<State>().last_shown.lock().unwrap() = Some(Instant::now());
    let _ = window.show();
    // Showing applies pending size changes, so settle the position once more.
    place(app, &window);
    let _ = window.set_focus();
    let _ = app.emit("window-visible", true);
}

pub fn hide(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let _ = window.hide();
    *app.state::<State>().last_hidden.lock().unwrap() = Some(Instant::now());
    let _ = app.emit("window-visible", false);
}

pub fn toggle(app: &AppHandle) {
    let visible = app
        .get_webview_window(LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if visible {
        hide(app);
        return;
    }

    let just_hidden = app
        .state::<State>()
        .last_hidden
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < REOPEN_GUARD);
    if !just_hidden {
        show(app);
    }
}

pub fn on_blur(app: &AppHandle) {
    let state = app.state::<State>();
    let just_shown = state
        .last_shown
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < BLUR_GRACE);
    if !just_shown && !state.pinned.load(Ordering::Relaxed) {
        hide(app);
    }
}

/// A pinned flyout stays open when it loses focus and floats above other windows.
pub fn set_pinned(app: &AppHandle, pinned: bool) {
    app.state::<State>().pinned.store(pinned, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.set_always_on_top(pinned);
    }
}

/// Puts the window in the corner of the work area (the screen minus the
/// taskbar) of whichever monitor the cursor is on.
fn place(app: &AppHandle, window: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let margin = (MARGIN * scale).round() as i32;

    let width = (WIDTH * scale).round() as u32;
    let height = ((HEIGHT * scale).round() as i32).min(area.size.height as i32 - 2 * margin) as u32;
    let _ = window.set_size(PhysicalSize::new(width, height));

    // Anchor on the size the window really has. Right after creation it can
    // differ from the one just requested, which left the first opening
    // hanging below the taskbar.
    let actual = window
        .outer_size()
        .unwrap_or(PhysicalSize::new(width, height));
    let _ = window.set_position(PhysicalPosition::new(
        area.position.x + area.size.width as i32 - actual.width as i32 - margin,
        area.position.y + area.size.height as i32 - actual.height as i32 - margin,
    ));
}
