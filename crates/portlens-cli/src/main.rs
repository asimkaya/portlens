use std::collections::BTreeSet;
use std::io::{self, Write};
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use portlens_core::{Protection, Snapshot, Socket, kill};

#[derive(Parser)]
#[command(version, about = "See which process owns a port, and stop it.")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List listening ports.
    List {
        /// Include connections that are not listening.
        #[arg(long)]
        all: bool,
        /// Include ports owned by Windows itself.
        #[arg(long)]
        system: bool,
        #[arg(long)]
        json: bool,
    },
    /// Show what is using a port.
    Who { port: u16 },
    /// Stop whatever is listening on a port.
    Kill {
        port: u16,
        /// Also stop the processes it started.
        #[arg(long)]
        tree: bool,
        /// Skip the confirmation prompt.
        #[arg(short, long)]
        yes: bool,
    },
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("portlens: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode, String> {
    let snapshot = portlens_core::snapshot().map_err(|e| e.to_string())?;

    match cli.command {
        Command::List { all, system, json } => {
            let rows: Vec<&Socket> = snapshot
                .sockets
                .iter()
                .filter(|s| all || s.is_listening())
                .filter(|s| system || !is_system(&snapshot, s))
                .collect();
            if json {
                let out = serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?;
                println!("{out}");
            } else {
                print_table(&snapshot, &rows);
            }
            Ok(ExitCode::SUCCESS)
        }
        Command::Who { port } => {
            let rows = listeners_on(&snapshot, port);
            if rows.is_empty() {
                println!("Nothing is listening on port {port}.");
                return Ok(ExitCode::FAILURE);
            }
            print_table(&snapshot, &rows);
            Ok(ExitCode::SUCCESS)
        }
        Command::Kill { port, tree, yes } => stop_port(&snapshot, port, tree, yes),
    }
}

fn is_system(snapshot: &Snapshot, socket: &Socket) -> bool {
    snapshot
        .processes
        .get(&socket.pid)
        .is_some_and(|p| p.is_system)
}

fn listeners_on(snapshot: &Snapshot, port: u16) -> Vec<&Socket> {
    snapshot
        .sockets
        .iter()
        .filter(|s| s.is_listening() && s.local.port() == port)
        .collect()
}

fn stop_port(snapshot: &Snapshot, port: u16, tree: bool, yes: bool) -> Result<ExitCode, String> {
    let rows = listeners_on(snapshot, port);
    let pids: BTreeSet<u32> = rows.iter().map(|s| s.pid).collect();
    if pids.is_empty() {
        println!("Nothing is listening on port {port}.");
        return Ok(ExitCode::FAILURE);
    }

    print_table(snapshot, &rows);
    if !yes
        && !confirm(if tree {
            "Stop these and their child processes?"
        } else {
            "Stop these processes?"
        })
    {
        return Ok(ExitCode::FAILURE);
    }

    let mut failed = false;
    for pid in pids {
        let info = &snapshot.processes[&pid];
        if info.protection == Protection::Locked {
            eprintln!(
                "{} (PID {pid}): {}",
                info.name,
                info.protection_reason.unwrap_or("protected")
            );
            failed = true;
            continue;
        }
        match kill::stop(pid, info.started_at, tree) {
            Ok(report) => {
                println!(
                    "Stopped {} (PID {pid}), {} process(es) in total.",
                    info.name,
                    report.stopped.len()
                );
                for f in &report.failed {
                    eprintln!("  PID {}: {}", f.pid, f.message);
                    failed = true;
                }
            }
            Err(err) => {
                eprintln!("{} (PID {pid}): {err}", info.name);
                failed = true;
            }
        }
    }
    Ok(if failed {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    })
}

fn confirm(question: &str) -> bool {
    print!("{question} [y/N] ");
    let _ = io::stdout().flush();
    let mut answer = String::new();
    io::stdin().read_line(&mut answer).is_ok() && answer.trim().eq_ignore_ascii_case("y")
}

fn print_table(snapshot: &Snapshot, rows: &[&Socket]) {
    let mut lines: Vec<[String; 6]> = rows
        .iter()
        .map(|s| {
            let process = snapshot.processes.get(&s.pid);
            [
                s.local.port().to_string(),
                format!("{:?}", s.protocol).to_uppercase(),
                s.local.ip().to_string(),
                s.state
                    .map_or("-".into(), |st| format!("{st:?}").to_uppercase()),
                s.pid.to_string(),
                process.map_or("?".into(), |p| p.name.clone()),
            ]
        })
        .collect();
    lines.sort_by_key(|l| (l[0].parse::<u16>().unwrap_or(0), l[1].clone(), l[2].clone()));

    let header = ["PORT", "PROTO", "ADDRESS", "STATE", "PID", "PROCESS"].map(String::from);
    let mut widths = header.each_ref().map(String::len);
    for line in &lines {
        for (w, cell) in widths.iter_mut().zip(line) {
            *w = (*w).max(cell.len());
        }
    }

    for line in std::iter::once(&header).chain(&lines) {
        let cells: Vec<String> = line
            .iter()
            .zip(widths)
            .map(|(cell, w)| format!("{cell:<w$}"))
            .collect();
        println!("{}", cells.join("  ").trim_end());
    }
}
