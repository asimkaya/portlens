//! Lists the sockets open on a Windows machine, who owns them, and stops the
//! owning processes. Windows is the only supported platform.

mod classify;
mod elevation;
mod error;
mod image_path;
pub mod kill;
mod model;
mod processes;
mod services;
mod sockets;

use std::collections::BTreeSet;

pub use elevation::{detach_console, is_elevated, relaunch_as_admin, wait_for_exit};
pub use error::{Error, Result};
pub use model::{ProcessInfo, Protection, Protocol, Snapshot, Socket, TcpState};

/// Reads every TCP and UDP socket together with the process that owns it.
pub fn snapshot() -> Result<Snapshot> {
    let sockets = sockets::list()?;
    let pids: BTreeSet<u32> = sockets.iter().map(|s| s.pid).collect();
    let processes = processes::describe(&pids);
    Ok(Snapshot { sockets, processes })
}
