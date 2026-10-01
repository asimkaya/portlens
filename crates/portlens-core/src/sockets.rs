//! Reads the kernel's TCP and UDP tables through iphlpapi.

use std::ffi::c_void;
use std::mem::size_of;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, SocketAddrV6};

use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, NO_ERROR};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
    MIB_UDP6ROW_OWNER_PID, MIB_UDPROW_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};

use crate::error::{Error, Result};
use crate::model::{Protocol, Socket, TcpState};

pub fn list() -> Result<Vec<Socket>> {
    let mut sockets = Vec::new();

    for (family, v6) in [(AF_INET.0 as u32, false), (AF_INET6.0 as u32, true)] {
        let tcp = fetch(|buf, size| unsafe {
            GetExtendedTcpTable(buf, size, false, family, TCP_TABLE_OWNER_PID_ALL, 0)
        })
        .map_err(|code| table_error("GetExtendedTcpTable", code))?;
        let udp = fetch(|buf, size| unsafe {
            GetExtendedUdpTable(buf, size, false, family, UDP_TABLE_OWNER_PID, 0)
        })
        .map_err(|code| table_error("GetExtendedUdpTable", code))?;

        if v6 {
            sockets.extend(rows::<MIB_TCP6ROW_OWNER_PID>(&tcp).map(tcp6_socket));
            sockets.extend(rows::<MIB_UDP6ROW_OWNER_PID>(&udp).map(udp6_socket));
        } else {
            sockets.extend(rows::<MIB_TCPROW_OWNER_PID>(&tcp).map(tcp4_socket));
            sockets.extend(rows::<MIB_UDPROW_OWNER_PID>(&udp).map(udp4_socket));
        }
    }

    Ok(sockets)
}

fn table_error(call: &'static str, code: u32) -> Error {
    Error::Api {
        call,
        source: windows::core::Error::from_hresult(windows::core::HRESULT::from_win32(code)),
    }
}

/// The table can grow between asking for its size and reading it, so retry
/// with the size the API reports until the call succeeds.
fn fetch(call: impl Fn(Option<*mut c_void>, *mut u32) -> u32) -> std::result::Result<Vec<u8>, u32> {
    let mut size = 0u32;
    // The first call only reports the required size.
    call(None, &mut size);

    for _ in 0..8 {
        // Over-allocate a little so a few new sockets do not force another round trip.
        let mut buf = vec![0u8; size as usize + 4096];
        size = buf.len() as u32;
        match call(Some(buf.as_mut_ptr().cast()), &mut size) {
            code if code == NO_ERROR.0 => {
                buf.truncate(size as usize);
                return Ok(buf);
            }
            code if code == ERROR_INSUFFICIENT_BUFFER.0 => continue,
            code => return Err(code),
        }
    }
    Err(ERROR_INSUFFICIENT_BUFFER.0)
}

/// Iterates the rows of a `MIB_*TABLE_OWNER_PID` buffer: a `u32` row count
/// followed by that many packed rows.
fn rows<T: Copy>(buf: &[u8]) -> impl Iterator<Item = T> + '_ {
    let header = size_of::<u32>();
    let count = buf
        .get(..header)
        .map(|b| u32::from_ne_bytes(b.try_into().unwrap()) as usize)
        .unwrap_or(0);
    // Trust the buffer length over the count the kernel wrote.
    let count = count.min(buf.len().saturating_sub(header) / size_of::<T>());

    (0..count).map(move |i| unsafe {
        // The Vec<u8> is not guaranteed to be 4-byte aligned, so read unaligned.
        buf.as_ptr()
            .add(header + i * size_of::<T>())
            .cast::<T>()
            .read_unaligned()
    })
}

/// Ports live in the low 16 bits of a `u32`, in network byte order.
fn port(raw: u32) -> u16 {
    u16::from_be(raw as u16)
}

/// The kernel stores IPv4 addresses as the four address bytes in memory order.
fn v4(raw: u32) -> Ipv4Addr {
    Ipv4Addr::from(raw.to_ne_bytes())
}

fn v6(octets: [u8; 16], scope_id: u32, port: u16) -> SocketAddr {
    SocketAddr::V6(SocketAddrV6::new(Ipv6Addr::from(octets), port, 0, scope_id))
}

/// Established connections carry a peer address; listeners report 0.0.0.0:0.
fn peer(state: Option<TcpState>, addr: SocketAddr) -> Option<SocketAddr> {
    match state {
        Some(TcpState::Listen) | Some(TcpState::Closed) => None,
        _ if addr.port() == 0 && addr.ip().is_unspecified() => None,
        _ => Some(addr),
    }
}

fn tcp4_socket(row: MIB_TCPROW_OWNER_PID) -> Socket {
    let state = TcpState::from_mib(row.dwState);
    let remote = SocketAddr::new(v4(row.dwRemoteAddr).into(), port(row.dwRemotePort));
    Socket {
        protocol: Protocol::Tcp,
        local: SocketAddr::new(v4(row.dwLocalAddr).into(), port(row.dwLocalPort)),
        remote: peer(state, remote),
        state,
        pid: row.dwOwningPid,
    }
}

fn tcp6_socket(row: MIB_TCP6ROW_OWNER_PID) -> Socket {
    let state = TcpState::from_mib(row.dwState);
    let remote = v6(
        row.ucRemoteAddr,
        row.dwRemoteScopeId,
        port(row.dwRemotePort),
    );
    Socket {
        protocol: Protocol::Tcp,
        local: v6(row.ucLocalAddr, row.dwLocalScopeId, port(row.dwLocalPort)),
        remote: peer(state, remote),
        state,
        pid: row.dwOwningPid,
    }
}

fn udp4_socket(row: MIB_UDPROW_OWNER_PID) -> Socket {
    Socket {
        protocol: Protocol::Udp,
        local: SocketAddr::new(v4(row.dwLocalAddr).into(), port(row.dwLocalPort)),
        remote: None,
        state: None,
        pid: row.dwOwningPid,
    }
}

fn udp6_socket(row: MIB_UDP6ROW_OWNER_PID) -> Socket {
    Socket {
        protocol: Protocol::Udp,
        local: v6(row.ucLocalAddr, row.dwLocalScopeId, port(row.dwLocalPort)),
        remote: None,
        state: None,
        pid: row.dwOwningPid,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ports_are_converted_from_network_byte_order() {
        // 8080 = 0x1F90, stored big-endian in the low half of the u32.
        let raw = u32::from_ne_bytes([0x1F, 0x90, 0, 0]);
        assert_eq!(port(raw), 8080);
    }

    #[test]
    fn ipv4_bytes_keep_their_order() {
        let raw = u32::from_ne_bytes([127, 0, 0, 1]);
        assert_eq!(v4(raw), Ipv4Addr::LOCALHOST);
    }

    #[test]
    fn rows_stop_at_the_buffer_even_if_the_count_lies() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&1000u32.to_ne_bytes());
        for pid in [11u32, 22] {
            let row = MIB_UDPROW_OWNER_PID {
                dwLocalAddr: 0,
                dwLocalPort: 0,
                dwOwningPid: pid,
            };
            let bytes = unsafe {
                std::slice::from_raw_parts(
                    (&row as *const MIB_UDPROW_OWNER_PID).cast::<u8>(),
                    size_of::<MIB_UDPROW_OWNER_PID>(),
                )
            };
            buf.extend_from_slice(bytes);
        }
        let pids: Vec<u32> = rows::<MIB_UDPROW_OWNER_PID>(&buf)
            .map(|r| r.dwOwningPid)
            .collect();
        assert_eq!(pids, [11, 22]);
    }

    #[test]
    fn listeners_have_no_peer() {
        let any = SocketAddr::new(Ipv4Addr::UNSPECIFIED.into(), 0);
        assert_eq!(peer(Some(TcpState::Listen), any), None);
        let real = SocketAddr::new(Ipv4Addr::new(10, 0, 0, 5).into(), 443);
        assert_eq!(peer(Some(TcpState::Established), real), Some(real));
    }

    #[test]
    fn the_live_table_can_be_read() {
        // Any running Windows machine has at least one socket open.
        assert!(!list().unwrap().is_empty());
    }
}
