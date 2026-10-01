//! Finds the executable behind a PID without opening the process.
//!
//! `OpenProcess` is refused for services that run under another account, which
//! includes most of `svchost.exe`. Asking the kernel by PID, the way Task
//! Manager does, works for a standard user and returns an NT-style path such
//! as `\Device\HarddiskVolume3\Windows\System32\svchost.exe`.

use std::ffi::c_void;
use std::mem::size_of;
use std::path::PathBuf;

use windows::Wdk::System::SystemInformation::{NtQuerySystemInformation, SYSTEM_INFORMATION_CLASS};
use windows::Win32::Foundation::{HANDLE, STATUS_INFO_LENGTH_MISMATCH, UNICODE_STRING};
use windows::Win32::Storage::FileSystem::{GetLogicalDriveStringsW, QueryDosDeviceW};
use windows::core::PCWSTR;

/// `SystemProcessIdInformation`, which `windows` does not name.
const SYSTEM_PROCESS_ID_INFORMATION: SYSTEM_INFORMATION_CLASS = SYSTEM_INFORMATION_CLASS(88);

#[repr(C)]
struct ProcessIdInformation {
    process_id: HANDLE,
    image_name: UNICODE_STRING,
}

/// Translates NT device paths into drive-letter paths.
pub struct ImagePaths {
    /// `("\Device\HarddiskVolume3", "C:")`
    volumes: Vec<(String, String)>,
}

impl ImagePaths {
    pub fn new() -> Self {
        Self {
            volumes: drive_volumes(),
        }
    }

    pub fn get(&self, pid: u32) -> Option<PathBuf> {
        let nt_path = query_nt_path(pid)?;
        self.volumes.iter().find_map(|(device, drive)| {
            let rest = nt_path.strip_prefix(device.as_str())?;
            // `\Device\HarddiskVolume1` must not match `\Device\HarddiskVolume10`.
            rest.starts_with('\\')
                .then(|| PathBuf::from(format!("{drive}{rest}")))
        })
    }
}

fn query_nt_path(pid: u32) -> Option<String> {
    // Image paths are bounded by the 32k-character limit of NT paths.
    let mut name = vec![0u16; 1024];

    for _ in 0..2 {
        let mut info = ProcessIdInformation {
            process_id: HANDLE(pid as usize as *mut c_void),
            image_name: UNICODE_STRING {
                Length: 0,
                MaximumLength: (name.len() * 2) as u16,
                Buffer: windows::core::PWSTR(name.as_mut_ptr()),
            },
        };
        let status = unsafe {
            NtQuerySystemInformation(
                SYSTEM_PROCESS_ID_INFORMATION,
                (&mut info as *mut ProcessIdInformation).cast(),
                size_of::<ProcessIdInformation>() as u32,
                std::ptr::null_mut(),
            )
        };

        if status.is_ok() {
            let chars = info.image_name.Length as usize / 2;
            return Some(String::from_utf16_lossy(&name[..chars]));
        }
        if status == STATUS_INFO_LENGTH_MISMATCH {
            // The kernel reports the size it needs in MaximumLength.
            name.resize(info.image_name.MaximumLength as usize / 2, 0);
            continue;
        }
        return None;
    }
    None
}

fn drive_volumes() -> Vec<(String, String)> {
    let mut letters = vec![0u16; 512];
    let written = unsafe { GetLogicalDriveStringsW(Some(&mut letters)) } as usize;
    if written == 0 || written > letters.len() {
        return Vec::new();
    }

    letters[..written]
        .split(|&c| c == 0)
        .filter(|s| !s.is_empty())
        .filter_map(|root| {
            // "C:\" -> "C:", the form QueryDosDevice expects.
            let drive: Vec<u16> = root.iter().copied().take(2).chain([0]).collect();
            let mut device = [0u16; 512];
            let len =
                unsafe { QueryDosDeviceW(PCWSTR(drive.as_ptr()), Some(&mut device)) } as usize;
            if len == 0 {
                return None;
            }
            // The result is a multi-string; the first entry is the device.
            let end = device.iter().position(|&c| c == 0).unwrap_or(len);
            Some((
                String::from_utf16_lossy(&device[..end]),
                String::from_utf16_lossy(&drive[..2]),
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_our_own_executable() {
        let found = ImagePaths::new().get(std::process::id()).unwrap();
        let expected = std::env::current_exe().unwrap();
        assert!(
            found
                .to_string_lossy()
                .eq_ignore_ascii_case(&expected.to_string_lossy())
        );
    }
}
