//! Decides which processes belong to Windows and which are risky to stop.

use std::path::{Path, PathBuf};

use crate::model::Protection;

/// Processes whose death takes the machine down or forces a logoff.
const CRITICAL: &[&str] = &[
    "system",
    "registry",
    "secure system",
    "memory compression",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
];

/// Windows components that can be stopped but are usually restarted or hosted
/// alongside many unrelated services.
const FRAGILE: &[&str] = &["svchost.exe", "explorer.exe", "dwm.exe", "spoolsv.exe"];

/// Subfolders of the Windows directory that only hold OS components.
/// `C:\Windows\Temp` and similar writable folders are deliberately left out.
const SYSTEM_DIRS: &[&str] = &["system32", "syswow64", "systemapps", "winsxs", "servicing"];

pub fn is_system(pid: u32, exe: Option<&Path>, windows_dir: &Path) -> bool {
    if pid == 0 || pid == 4 {
        return true;
    }
    let Some(exe) = exe else { return false };
    // Windows paths are case-insensitive, but `Path` comparison is not.
    let exe = PathBuf::from(exe.to_string_lossy().to_ascii_lowercase());
    let windows_dir = PathBuf::from(windows_dir.to_string_lossy().to_ascii_lowercase());
    let Ok(rest) = exe.strip_prefix(&windows_dir) else {
        return false;
    };
    let mut parts = rest.components();
    match (parts.next(), parts.next()) {
        // An executable that sits directly in C:\Windows, e.g. explorer.exe.
        (Some(_), None) => true,
        (Some(dir), Some(_)) => {
            let dir = dir.as_os_str().to_string_lossy().to_ascii_lowercase();
            SYSTEM_DIRS.contains(&dir.as_str())
        }
        _ => false,
    }
}

pub fn protection(
    pid: u32,
    name: &str,
    is_system: bool,
    own_pid: u32,
) -> (Protection, Option<&'static str>) {
    if pid == own_pid {
        return (Protection::Locked, Some("This is Portlens itself."));
    }
    if pid == 0 {
        return (Protection::Locked, Some("The kernel owns this socket."));
    }
    if !is_system {
        return (Protection::None, None);
    }
    let name = name.to_ascii_lowercase();
    if pid == 4 || CRITICAL.contains(&name.as_str()) {
        return (
            Protection::Locked,
            Some("Stopping a core Windows process would crash the machine or log you out."),
        );
    }
    if FRAGILE.contains(&name.as_str()) {
        return (
            Protection::Caution,
            Some("This Windows process hosts other components. Stopping it can break them."),
        );
    }
    (
        Protection::Caution,
        Some("This is part of Windows. Stopping it can cause instability."),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const WIN: &str = r"C:\Windows";

    fn sys(exe: &str) -> bool {
        is_system(1234, Some(Path::new(exe)), Path::new(WIN))
    }

    #[test]
    fn os_folders_are_system() {
        assert!(sys(r"C:\Windows\System32\svchost.exe"));
        assert!(sys(r"C:\Windows\SysWOW64\something.exe"));
        assert!(sys(r"C:\Windows\explorer.exe"));
    }

    #[test]
    fn path_case_does_not_matter() {
        assert!(sys(r"c:\WINDOWS\system32\SVCHOST.EXE"));
    }

    #[test]
    fn writable_folders_inside_windows_are_not_system() {
        assert!(!sys(r"C:\Windows\Temp\dropper.exe"));
        assert!(!sys(r"C:\Windows\Tasks\x.exe"));
    }

    #[test]
    fn user_software_is_not_system() {
        assert!(!sys(r"C:\Program Files\nodejs\node.exe"));
        assert!(!sys(r"C:\WindowsApps\fake\System32\x.exe"));
    }

    #[test]
    fn kernel_pids_are_system_without_a_path() {
        assert!(is_system(0, None, Path::new(WIN)));
        assert!(is_system(4, None, Path::new(WIN)));
        assert!(!is_system(5000, None, Path::new(WIN)));
    }

    #[test]
    fn protection_levels() {
        assert_eq!(protection(4, "System", true, 1).0, Protection::Locked);
        assert_eq!(protection(700, "lsass.exe", true, 1).0, Protection::Locked);
        assert_eq!(
            protection(800, "svchost.exe", true, 1).0,
            Protection::Caution
        );
        assert_eq!(protection(900, "node.exe", false, 1).0, Protection::None);
        assert_eq!(
            protection(1, "portlens.exe", false, 1).0,
            Protection::Locked
        );
    }

    #[test]
    fn a_spoofed_critical_name_outside_windows_is_not_locked() {
        // User software that borrows a system process name is still user software.
        assert_eq!(protection(900, "lsass.exe", false, 1).0, Protection::None);
    }
}
