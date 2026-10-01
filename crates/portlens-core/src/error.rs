use windows::core::Error as WinError;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{call} failed: {source}")]
    Api {
        call: &'static str,
        source: WinError,
    },

    #[error("Access denied. Restart Portlens as administrator to stop this process.")]
    AccessDenied,

    #[error("This process is protected: {0}")]
    Protected(&'static str),

    #[error("The process is no longer running.")]
    Gone,

    #[error("The PID now belongs to a different process, so nothing was stopped.")]
    PidReused,

    #[error("The process did not exit within the timeout.")]
    StillRunning,

    #[error("Administrator permission was not granted.")]
    ElevationDeclined,
}

pub type Result<T> = std::result::Result<T, Error>;
