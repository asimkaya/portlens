//! Maps process IDs to the Windows services they host.
//!
//! One `svchost.exe` can host a dozen unrelated services, so the process name
//! alone says little about why a port is open.

use std::collections::HashMap;
use std::slice;

use windows::Win32::Foundation::ERROR_MORE_DATA;
use windows::Win32::System::Services::{
    CloseServiceHandle, ENUM_SERVICE_STATUS_PROCESSW, EnumServicesStatusExW, OpenSCManagerW,
    SC_ENUM_PROCESS_INFO, SC_MANAGER_ENUMERATE_SERVICE, SERVICE_ACTIVE, SERVICE_WIN32,
};
use windows::core::{HRESULT, PCWSTR};

/// Best effort: an empty map is returned if the service manager is unreachable.
pub fn by_pid() -> HashMap<u32, Vec<String>> {
    let mut services: HashMap<u32, Vec<String>> = HashMap::new();

    unsafe {
        let Ok(manager) =
            OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ENUMERATE_SERVICE)
        else {
            return services;
        };

        // The entries hold pointers, so the buffer must be 8-byte aligned.
        let mut buf = vec![0u64; 32 * 1024];
        let mut resume = 0u32;

        loop {
            let (mut needed, mut returned) = (0u32, 0u32);
            let bytes = slice::from_raw_parts_mut(buf.as_mut_ptr().cast::<u8>(), buf.len() * 8);
            let result = EnumServicesStatusExW(
                manager,
                SC_ENUM_PROCESS_INFO,
                SERVICE_WIN32,
                SERVICE_ACTIVE,
                Some(bytes),
                &mut needed,
                &mut returned,
                Some(&mut resume),
                PCWSTR::null(),
            );

            let more =
                matches!(&result, Err(e) if e.code() == HRESULT::from_win32(ERROR_MORE_DATA.0));
            if result.is_err() && !more {
                break;
            }

            let entries = slice::from_raw_parts(
                buf.as_ptr().cast::<ENUM_SERVICE_STATUS_PROCESSW>(),
                returned as usize,
            );
            for entry in entries {
                let pid = entry.ServiceStatusProcess.dwProcessId;
                if pid == 0 {
                    continue;
                }
                if let Ok(name) = entry.lpDisplayName.to_string() {
                    services.entry(pid).or_default().push(name);
                }
            }

            if !more || returned == 0 {
                break;
            }
        }

        let _ = CloseServiceHandle(manager);
    }

    for names in services.values_mut() {
        names.sort();
    }
    services
}
