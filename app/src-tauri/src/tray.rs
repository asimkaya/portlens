//! The tray icon, and the right-click menu listing the ports your own
//! programs have open.

use std::collections::BTreeMap;
use std::thread;
use std::time::Duration;

use portlens_core::{Protocol, Snapshot};
use serde::Serialize;
use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter};

use crate::flyout;

const TRAY_ID: &str = "main";
const MAX_MENU_PORTS: usize = 8;
const REFRESH_EVERY: Duration = Duration::from_secs(4);
const PORT_PREFIX: &str = "port:";

/// A port one of the user's own programs is listening on.
#[derive(Debug, Clone, PartialEq, Eq)]
struct OpenPort {
    port: u16,
    protocol: Protocol,
    pid: u32,
    process: String,
}

/// Sent to the interface when a port is picked from the menu.
#[derive(Serialize, Clone)]
struct Selection {
    port: u16,
    protocol: &'static str,
    pid: u32,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let ports = open_ports();

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(tooltip(&ports))
        .menu(&build_menu(app, &ports)?)
        // Left click opens the flyout; only the right click shows the menu.
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                flyout::toggle(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    keep_fresh(app.clone(), ports);
    Ok(())
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id.as_ref();
    match id {
        "open" => flyout::show(app),
        "quit" => app.exit(0),
        _ => {
            if let Some(selection) = id.strip_prefix(PORT_PREFIX).and_then(parse_selection) {
                flyout::show(app);
                let _ = app.emit("select-port", selection);
            }
        }
    }
}

fn parse_selection(rest: &str) -> Option<Selection> {
    let mut parts = rest.split(':');
    let protocol = match parts.next()? {
        "tcp" => "tcp",
        "udp" => "udp",
        _ => return None,
    };
    Some(Selection {
        protocol,
        port: parts.next()?.parse().ok()?,
        pid: parts.next()?.parse().ok()?,
    })
}

fn build_menu(app: &AppHandle, ports: &[OpenPort]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    let heading = if ports.is_empty() {
        "No ports open from your programs"
    } else {
        "Open ports"
    };
    menu.append(&MenuItem::with_id(
        app,
        "heading",
        heading,
        false,
        None::<&str>,
    )?)?;

    let dot = green_dot();
    for open in ports.iter().take(MAX_MENU_PORTS) {
        let protocol = match open.protocol {
            Protocol::Tcp => "tcp",
            Protocol::Udp => "udp",
        };
        menu.append(&IconMenuItem::with_id(
            app,
            format!("{PORT_PREFIX}{protocol}:{}:{}", open.port, open.pid),
            format!("{}   {}", open.port, open.process),
            true,
            Some(dot.clone()),
            None::<&str>,
        )?)?;
    }
    if ports.len() > MAX_MENU_PORTS {
        let more = format!("and {} more", ports.len() - MAX_MENU_PORTS);
        menu.append(&MenuItem::with_id(app, "more", more, false, None::<&str>)?)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Show all ports",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "quit",
        "Quit Portlens",
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

fn tooltip(ports: &[OpenPort]) -> String {
    match ports.len() {
        0 => "Portlens".to_owned(),
        1 => "Portlens: 1 open port".to_owned(),
        n => format!("Portlens: {n} open ports"),
    }
}

/// Menus cannot change while they are open, so rebuild one in the background
/// whenever the set of ports differs from what the menu shows.
fn keep_fresh(app: AppHandle, mut shown: Vec<OpenPort>) {
    thread::spawn(move || {
        loop {
            thread::sleep(REFRESH_EVERY);
            let ports = open_ports();
            if ports == shown {
                continue;
            }
            if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(&app, &ports)) {
                let _ = tray.set_menu(Some(menu));
                let _ = tray.set_tooltip(Some(tooltip(&ports)));
            }
            shown = ports;
        }
    });
}

fn open_ports() -> Vec<OpenPort> {
    portlens_core::snapshot()
        .map(|snapshot| summarize(&snapshot))
        .unwrap_or_default()
}

/// One entry per program and port: a server bound to both IPv4 and IPv6 would
/// otherwise be listed twice. Windows' own services are left out.
fn summarize(snapshot: &Snapshot) -> Vec<OpenPort> {
    let mut unique = BTreeMap::new();
    for socket in snapshot.sockets.iter().filter(|s| s.is_listening()) {
        let Some(process) = snapshot.processes.get(&socket.pid) else {
            continue;
        };
        if process.is_system {
            continue;
        }
        let port = socket.local.port();
        unique
            .entry((port, protocol_rank(socket.protocol), socket.pid))
            .or_insert_with(|| OpenPort {
                port,
                protocol: socket.protocol,
                pid: socket.pid,
                process: process.name.clone(),
            });
    }
    unique.into_values().collect()
}

fn protocol_rank(protocol: Protocol) -> u8 {
    match protocol {
        Protocol::Tcp => 0,
        Protocol::Udp => 1,
    }
}

/// A 16x16 anti-aliased dot, the size Windows draws menu icons at.
fn green_dot() -> Image<'static> {
    const SIZE: u32 = 16;
    const RADIUS: f32 = 4.6;
    let centre = (SIZE as f32 - 1.0) / 2.0;

    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let distance = ((x as f32 - centre).powi(2) + (y as f32 - centre).powi(2)).sqrt();
            let coverage = (RADIUS + 0.5 - distance).clamp(0.0, 1.0);
            rgba.extend_from_slice(&[0x2f, 0xbf, 0x71, (coverage * 255.0) as u8]);
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
}
