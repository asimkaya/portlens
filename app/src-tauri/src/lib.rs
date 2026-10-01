use portlens_core::{Snapshot, kill};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const MAIN_WINDOW: &str = "main";

#[tauri::command(async)]
fn snapshot() -> Result<Snapshot, String> {
    portlens_core::snapshot().map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn stop_process(pid: u32, started_at: Option<u64>, tree: bool) -> Result<kill::Report, String> {
    kill::stop(pid, started_at, tree).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_elevated() -> bool {
    portlens_core::is_elevated()
}

#[tauri::command]
fn restart_as_admin(app: AppHandle) -> Result<(), String> {
    // The elevated copy waits for this process to exit before it starts, so
    // the single-instance check does not mistake us for a running instance.
    let args = format!("{AFTER_PID_FLAG} {}", std::process::id());
    portlens_core::relaunch_as_admin(&args).map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

/// Only ever opens `http://localhost:<port>`, so the webview cannot be used to
/// launch arbitrary URLs.
#[tauri::command]
fn open_in_browser(app: AppHandle, port: u16) -> Result<(), String> {
    app.opener()
        .open_url(format!("http://localhost:{port}"), None::<&str>)
        .map_err(|e| e.to_string())
}

const AFTER_PID_FLAG: &str = "--after-pid";

fn pid_to_wait_for() -> Option<u32> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == AFTER_PID_FLAG {
            return args.next()?.parse().ok();
        }
    }
    None
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("window-visible", true);
    }
}

fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
        let _ = app.emit("window-visible", false);
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Portlens", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("Portlens")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    if let Some(pid) = pid_to_wait_for() {
        portlens_core::wait_for_exit(pid, 5_000);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_window(app)
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            stop_process,
            is_elevated,
            restart_as_admin,
            open_in_browser,
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // The window closes to the tray; "Quit" in the tray menu exits.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                hide_window(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to start Portlens");
}
