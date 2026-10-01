use std::collections::HashMap;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use windows::Win32::Foundation::{
    ERROR_ACCESS_DENIED, ERROR_INVALID_PARAMETER, HANDLE, WAIT_OBJECT_0, WIN32_ERROR,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, TerminateProcess, WaitForSingleObject,
};
use windows::core::{HRESULT, Owned};

use crate::classify;
use crate::error::{Error, Result};
use crate::image_path::ImagePaths;
use crate::model::Protection;
use crate::processes::{exe_path, windows_dir};

const EXIT_WAIT_MS: u32 = 3000;

#[derive(Debug, Serialize)]
pub struct Failure {
    pub pid: u32,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub stopped: Vec<u32>,
    pub failed: Vec<Failure>,
}

/// Stops `pid`, and with `tree` also everything it started.
///
/// `started_at` is the start time the caller saw when it listed the process.
/// If the PID has since been handed to a different process, nothing is stopped.
pub fn stop(pid: u32, started_at: Option<u64>, tree: bool) -> Result<Report> {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );

    let target = system.process(Pid::from_u32(pid)).ok_or(Error::Gone)?;
    if started_at.is_some_and(|expected| expected != target.start_time()) {
        return Err(Error::PidReused);
    }

    let order = if tree {
        descendants_first(&system, pid)
    } else {
        vec![pid]
    };

    // Check every process before touching any, so a protected child cannot
    // leave a half-stopped tree behind.
    let windows_dir = windows_dir();
    let image_paths = ImagePaths::new();
    let own_pid = std::process::id();
    for &candidate in &order {
        let Some(process) = system.process(Pid::from_u32(candidate)) else {
            continue;
        };
        let exe = exe_path(candidate, Some(process), &image_paths);
        let is_system = classify::is_system(candidate, exe.as_deref(), &windows_dir);
        let name = process.name().to_string_lossy();
        if let (Protection::Locked, Some(reason)) =
            classify::protection(candidate, &name, is_system, own_pid)
        {
            return Err(Error::Protected(reason));
        }
    }

    let mut report = Report {
        stopped: Vec::new(),
        failed: Vec::new(),
    };
    for candidate in order {
        match terminate(candidate) {
            Ok(()) | Err(Error::Gone) => report.stopped.push(candidate),
            Err(err) => report.failed.push(Failure {
                pid: candidate,
                message: err.to_string(),
            }),
        }
    }
    Ok(report)
}

/// `root` and its descendants, deepest first, so children die before parents
/// can respawn them.
fn descendants_first(system: &System, root: u32) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, process) in system.processes() {
        let Some(parent_pid) = process.parent() else {
            continue;
        };
        // Windows reuses PIDs. A "child" that started before its parent is
        // really a leftover from an earlier process with the same PID.
        let parent_started = system.process(parent_pid).map(|p| p.start_time());
        if parent_started.is_some_and(|started| process.start_time() >= started) {
            children
                .entry(parent_pid.as_u32())
                .or_default()
                .push(pid.as_u32());
        }
    }

    fn visit(pid: u32, children: &HashMap<u32, Vec<u32>>, out: &mut Vec<u32>) {
        for &child in children.get(&pid).into_iter().flatten() {
            visit(child, children, out);
        }
        out.push(pid);
    }

    let mut order = Vec::new();
    visit(root, &children, &mut order);
    order
}

fn terminate(pid: u32) -> Result<()> {
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE | PROCESS_SYNCHRONIZE, false, pid)
            .map_err(|e| classify_error("OpenProcess", e))?;
        let handle: Owned<HANDLE> = Owned::new(handle);

        TerminateProcess(*handle, 1).map_err(|e| classify_error("TerminateProcess", e))?;

        if WaitForSingleObject(*handle, EXIT_WAIT_MS) == WAIT_OBJECT_0 {
            Ok(())
        } else {
            Err(Error::StillRunning)
        }
    }
}

fn classify_error(call: &'static str, source: windows::core::Error) -> Error {
    let is = |code: WIN32_ERROR| source.code() == HRESULT::from_win32(code.0);
    if is(ERROR_ACCESS_DENIED) {
        Error::AccessDenied
    } else if is(ERROR_INVALID_PARAMETER) {
        // OpenProcess reports a PID that does not exist this way.
        Error::Gone
    } else {
        Error::Api { call, source }
    }
}
