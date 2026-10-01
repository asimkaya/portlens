use std::collections::BTreeMap;
use std::net::SocketAddr;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
}

/// States as numbered by `MIB_TCP_STATE`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TcpState {
    Closed,
    Listen,
    SynSent,
    SynReceived,
    Established,
    FinWait1,
    FinWait2,
    CloseWait,
    Closing,
    LastAck,
    TimeWait,
    DeleteTcb,
}

impl TcpState {
    pub(crate) fn from_mib(value: u32) -> Option<Self> {
        Some(match value {
            1 => Self::Closed,
            2 => Self::Listen,
            3 => Self::SynSent,
            4 => Self::SynReceived,
            5 => Self::Established,
            6 => Self::FinWait1,
            7 => Self::FinWait2,
            8 => Self::CloseWait,
            9 => Self::Closing,
            10 => Self::LastAck,
            11 => Self::TimeWait,
            12 => Self::DeleteTcb,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Socket {
    pub protocol: Protocol,
    pub local: SocketAddr,
    /// Only set for TCP sockets that are connected to a peer.
    pub remote: Option<SocketAddr>,
    /// UDP has no connection state.
    pub state: Option<TcpState>,
    /// 0 when the kernel owns the socket (for example TIME_WAIT).
    pub pid: u32,
}

impl Socket {
    /// A socket that is waiting for traffic: a TCP listener or any bound UDP socket.
    pub fn is_listening(&self) -> bool {
        match self.protocol {
            Protocol::Tcp => self.state == Some(TcpState::Listen),
            Protocol::Udp => true,
        }
    }

    /// Loopback-only sockets cannot be reached from other machines.
    pub fn is_exposed(&self) -> bool {
        !self.local.ip().is_loopback()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Protection {
    None,
    /// Stopping it is allowed but likely to break something.
    Caution,
    /// Stopping it is refused.
    Locked,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub exe: Option<String>,
    pub command_line: Option<String>,
    pub parent_pid: Option<u32>,
    /// Seconds since the Unix epoch.
    pub started_at: Option<u64>,
    /// Part of Windows itself rather than something the user installed.
    pub is_system: bool,
    pub protection: Protection,
    pub protection_reason: Option<&'static str>,
    /// Display names of the Windows services hosted by this process.
    pub services: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub sockets: Vec<Socket>,
    pub processes: BTreeMap<u32, ProcessInfo>,
}
