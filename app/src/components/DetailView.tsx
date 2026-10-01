import {
  ChevronLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Layers,
  Lock,
  Network,
  Power,
  Workflow,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatAge } from "../format";
import { describeBinding, describeState, type Row } from "../rows";
import { Avatar } from "./Avatar";

interface Props {
  row: Row;
  onBack(): void;
  onStop(row: Row): void;
  onOpenInBrowser(port: number): void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused; there is nothing useful to tell the user.
    }
  }

  return (
    <button
      type="button"
      className="icon-button is-small"
      onClick={copy}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Fact({
  icon,
  label,
  action,
  children,
}: {
  icon: ReactNode;
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fact">
      <span className="fact-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="fact-body">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
      {action}
    </div>
  );
}

export function DetailView({ row, onBack, onStop, onOpenInBrowser }: Props) {
  const { process } = row;
  const locked = process.protection === "locked" || process.pid === 0;
  const canOpen = row.protocol === "tcp" && row.listening;
  const binding = describeBinding(row);

  return (
    <section className="detail" aria-label={`Details for port ${row.port}`}>
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={onBack}>
          <ChevronLeft size={18} aria-hidden="true" />
          Ports
        </button>
      </div>

      <div className="detail-scroll">
        <div className="hero">
          <span className={row.exposed ? "port-tag is-hero is-exposed" : "port-tag is-hero"}>
            {row.port}
          </span>
          <div className="hero-pills">
            <span className="pill">{row.protocol.toUpperCase()}</span>
            <span className={row.listening ? "pill is-live" : "pill"}>
              <i aria-hidden="true" />
              {describeState(row)}
            </span>
          </div>
        </div>

        <div className="owner">
          <Avatar name={process.name} system={process.is_system} size="large" />
          <div className="owner-text">
            <span className="owner-name">{process.name}</span>
            <span className="owner-sub">
              {process.pid === 0 ? "Owned by the kernel" : `PID ${process.pid}`}
              {process.is_system && " · Part of Windows"}
            </span>
          </div>
        </div>

        <p className={row.exposed ? "reach is-exposed" : "reach"}>
          {row.exposed ? (
            <Globe size={18} aria-hidden="true" />
          ) : (
            <Lock size={18} aria-hidden="true" />
          )}
          <span>
            <strong>{row.exposed ? "Open to your network" : "This computer only"}</strong>
            {row.exposed
              ? "Other devices on your network can reach this port."
              : "Only programs on this computer can reach this port."}
          </span>
        </p>

        <dl className="facts">
          <Fact icon={<Network size={16} />} label="Bound to">
            {binding}
            {row.addresses.length > 1 && (
              <span className="address-chips">
                {row.addresses.map((address) => (
                  <code key={address}>{address}</code>
                ))}
              </span>
            )}
          </Fact>

          {process.services.length > 0 && (
            <Fact icon={<Layers size={16} />} label="Windows services">
              {process.services.map((service) => (
                <span key={service} className="line">
                  {service}
                </span>
              ))}
            </Fact>
          )}

          {process.exe && (
            <Fact
              icon={<FolderOpen size={16} />}
              label="Program"
              action={<CopyButton text={process.exe} label="Copy path" />}
            >
              <code className="path">{process.exe}</code>
            </Fact>
          )}

          {process.started_at !== null && (
            <Fact icon={<Clock size={16} />} label="Started">
              <span title={new Date(process.started_at * 1000).toLocaleString()}>
                {formatAge(process.started_at)}
              </span>
            </Fact>
          )}

          {process.parent_pid !== null && (
            <Fact icon={<Workflow size={16} />} label="Started by">
              PID {process.parent_pid}
            </Fact>
          )}
        </dl>

        {process.command_line && (
          <details className="command">
            <summary>Command line</summary>
            <code>{process.command_line}</code>
          </details>
        )}
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className="button is-danger is-solid is-wide"
          disabled={locked}
          onClick={() => onStop(row)}
        >
          <Power size={16} aria-hidden="true" />
          Stop {process.name}
        </button>

        {locked && process.protection_reason && <p className="hint">{process.protection_reason}</p>}

        <div className="action-pair">
          {canOpen && (
            <button type="button" className="button" onClick={() => onOpenInBrowser(row.port)}>
              <ExternalLink size={15} aria-hidden="true" />
              Open in browser
            </button>
          )}
          <CopyAddress port={row.port} />
        </div>
      </div>
    </section>
  );
}

function CopyAddress({ port }: { port: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`localhost:${port}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // See CopyButton.
    }
  }

  return (
    <button type="button" className="button" onClick={copy} title={`Copy localhost:${port}`}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {copied ? "Copied" : "Copy address"}
    </button>
  );
}
