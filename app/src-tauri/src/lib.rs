mod flyout;
mod tray;

use portlens_core::{Snapshot, kill};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const AFTER_PID_FLAG: &str = "--after-pid";

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

#[tauri::command]
fn hide_window(app: AppHandle) {
    flyout::hide(&app);
}

#[tauri::command]
fn set_pinned(app: AppHandle, pinned: bool) {
    flyout::set_pinned(&app, pinned);
}

fn pid_to_wait_for() -> Option<u32> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == AFTER_PID_FLAG {
            return args.next()?.parse().ok();
        }
    }
    None
}

pub fn run() {
    if let Some(pid) = pid_to_wait_for() {
        portlens_core::detach_console();
        portlens_core::wait_for_exit(pid, 5_000);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            flyout::show(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            snapshot,
            stop_process,
            is_elevated,
            restart_as_admin,
            open_in_browser,
            hide_window,
            set_pinned,
        ])
        .setup(|app| {
            app.manage(flyout::State::default());
            tray::build(app.handle())?;
            // Whoever launched Portlens expects to see something happen.
            flyout::show(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) => flyout::on_blur(window.app_handle()),
            // Alt+F4 closes the flyout, not the app. "Quit" is in the tray menu.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                flyout::hide(window.app_handle());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("failed to start Portlens");
}
