use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use sysinfo::{Pid, Process, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use crate::classify;
use crate::image_path::ImagePaths;
use crate::model::{ProcessInfo, Protection};
use crate::services;

/// Describes the processes behind `pids`. A PID that no longer exists (the
/// process exited after the socket table was read) still gets a placeholder so
/// the caller can render its row.
pub fn describe(pids: &BTreeSet<u32>) -> BTreeMap<u32, ProcessInfo> {
    let targets: Vec<Pid> = pids.iter().map(|&pid| Pid::from_u32(pid)).collect();
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&targets),
        true,
        ProcessRefreshKind::nothing()
            .with_exe(UpdateKind::Always)
            .with_cmd(UpdateKind::Always),
    );

    let windows_dir = windows_dir();
    let own_pid = std::process::id();
    let mut hosted = services::by_pid();
    let image_paths = ImagePaths::new();

    pids.iter()
        .map(|&pid| {
            let process = system.process(Pid::from_u32(pid));
            let info = build(
                pid,
                process,
                &image_paths,
                &windows_dir,
                own_pid,
                hosted.remove(&pid).unwrap_or_default(),
            );
            (pid, info)
        })
        .collect()
}

pub(crate) fn windows_dir() -> PathBuf {
    std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
}

fn build(
    pid: u32,
    process: Option<&Process>,
    image_paths: &ImagePaths,
    windows_dir: &Path,
    own_pid: u32,
    services: Vec<String>,
) -> ProcessInfo {
    let name = match (pid, process) {
        (0, _) => "No owner".to_owned(),
        (_, Some(p)) => p.name().to_string_lossy().into_owned(),
        (_, None) => "Unknown".to_owned(),
    };
    let exe = exe_path(pid, process, image_paths);
    let is_system = classify::is_system(pid, exe.as_deref(), windows_dir);
    let (protection, protection_reason) = if process.is_none() && pid != 0 {
        (Protection::None, None)
    } else {
        classify::protection(pid, &name, is_system, own_pid)
    };

    ProcessInfo {
        pid,
        name,
        exe: exe.map(|p| p.to_string_lossy().into_owned()),
        command_line: process.and_then(command_line),
        parent_pid: process.and_then(|p| p.parent()).map(|p| p.as_u32()),
        started_at: process.map(|p| p.start_time()),
        is_system,
        protection,
        protection_reason,
        services,
    }
}

/// sysinfo opens the process to read its path, which Windows refuses for
/// services under other accounts. Ask the kernel directly when it comes up empty.
pub(crate) fn exe_path(
    pid: u32,
    process: Option<&Process>,
    image_paths: &ImagePaths,
) -> Option<PathBuf> {
    process
        .and_then(|p| p.exe())
        .map(Path::to_path_buf)
        .or_else(|| image_paths.get(pid))
}

fn command_line(process: &Process) -> Option<String> {
    let args: Vec<_> = process
        .cmd()
        .iter()
        .map(|arg| arg.to_string_lossy())
        .collect();
    (!args.is_empty()).then(|| args.join(" "))
}
