use std::ffi::c_void;
use std::mem::size_of;
use std::os::windows::ffi::OsStrExt;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation};
use windows::Win32::System::Console::FreeConsole;
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_SYNCHRONIZE, WaitForSingleObject,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{Owned, PCWSTR, w};

use crate::error::{Error, Result};

pub fn is_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let token = Owned::new(token);

        let mut elevation = TOKEN_ELEVATION::default();
        let mut written = 0u32;
        GetTokenInformation(
            *token,
            TokenElevation,
            Some((&mut elevation as *mut TOKEN_ELEVATION).cast::<c_void>()),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut written,
        )
        .is_ok()
            && elevation.TokenIsElevated != 0
    }
}

/// Starts a new, elevated copy of the running executable with `args`. The
/// caller is expected to exit afterwards. Fails if the user dismisses the UAC
/// prompt.
pub fn relaunch_as_admin(args: &str) -> Result<()> {
    let exe = std::env::current_exe().map_err(|_| Error::ElevationDeclined)?;
    let exe: Vec<u16> = exe.as_os_str().encode_wide().chain([0]).collect();
    let args: Vec<u16> = args.encode_utf16().chain([0]).collect();

    let result = unsafe {
        ShellExecuteW(
            None,
            w!("runas"),
            PCWSTR(exe.as_ptr()),
            PCWSTR(args.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecuteW reports success with a value greater than 32.
    if result.0 as usize > 32 {
        Ok(())
    } else {
        Err(Error::ElevationDeclined)
    }
}

/// Blocks until the process exits or `timeout_ms` passes. A process that is
/// already gone counts as exited.
pub fn wait_for_exit(pid: u32, timeout_ms: u32) {
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) else {
            return;
        };
        let handle = Owned::new(handle);
        WaitForSingleObject(*handle, timeout_ms);
    }
}

/// Lets go of the console this process was started with, if it has one.
///
/// Debug builds are console programs. When one relaunches itself elevated,
/// Windows opens a fresh console for the copy, and closing that console would
/// kill the app. Release builds have no console, so this does nothing there.
pub fn detach_console() {
    unsafe {
        let _ = FreeConsole();
    }
}
