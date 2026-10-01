import { Check, Copy, ExternalLink, Globe, Lock, Power, X } from "lucide-react";
import { useState } from "react";
import { formatAge } from "../format";
import { describeBinding, describeState, type Row } from "../rows";
import { Avatar } from "./PortTable";

interface Props {
  row: Row;
  onClose(): void;
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
      // Clipboard access can be denied; there is nothing useful to tell the user.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function DetailPanel({ row, onClose, onStop, onOpenInBrowser }: Props) {
  const { process } = row;
  const locked = process.protection === "locked" || process.pid === 0;
  const canOpen = row.protocol === "tcp" && row.listening;

  return (
    <aside className="detail" aria-label={`Details for port ${row.port}`}>
      <div className="detail-top">
        <div className="detail-heading">
          <span className={row.exposed ? "port-tag is-large is-exposed" : "port-tag is-large"}>
            {row.port}
          </span>
          <span className="detail-sub">
            {row.protocol.toUpperCase()} · {describeState(row)}
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
          title="Close (Esc)"
        >
          <X size={17} />
        </button>
      </div>

      <div className="detail-process">
        <Avatar name={process.name} system={process.is_system} />
        <div className="process-text">
          <span className="process-name">{process.name}</span>
          <span className="process-detail">
            {process.pid === 0 ? "Owned by the kernel" : `PID ${process.pid}`}
            {process.is_system && " · Part of Windows"}
          </span>
        </div>
      </div>

      <p className={row.exposed ? "exposure is-exposed" : "exposure"}>
        {row.exposed ? (
          <Globe size={16} aria-hidden="true" />
        ) : (
          <Lock size={16} aria-hidden="true" />
        )}
        {row.exposed
          ? "Other devices on your network can reach this port."
          : "Only programs on this computer can reach this port."}
      </p>

      <dl className="fields">
        <Field label="Bound to">
          {describeBinding(row)}
          {row.addresses.length > 1 && (
            <ul className="plain-list is-mono">
              {row.addresses.map((address) => (
                <li key={address}>{address}</li>
              ))}
            </ul>
          )}
        </Field>

        {process.services.length > 0 && (
          <Field label="Windows services">
            <ul className="plain-list">
              {process.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </Field>
        )}

        {process.exe && (
          <Field label="Location">
            <span className="value-row">
              <span className="mono">{process.exe}</span>
              <CopyButton text={process.exe} label="Copy path" />
            </span>
          </Field>
        )}

        {process.command_line && (
          <Field label="Command line">
            <span className="mono block">{process.command_line}</span>
          </Field>
        )}

        {process.started_at !== null && (
          <Field label="Started">
            <span title={new Date(process.started_at * 1000).toLocaleString()}>
              {formatAge(process.started_at)}
            </span>
          </Field>
        )}

        {process.parent_pid !== null && <Field label="Started by PID">{process.parent_pid}</Field>}
      </dl>

      <div className="detail-actions">
        {canOpen && (
          <button type="button" className="button" onClick={() => onOpenInBrowser(row.port)}>
            <ExternalLink size={16} aria-hidden="true" />
            Open localhost:{row.port}
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={() => navigator.clipboard?.writeText(`localhost:${row.port}`).catch(() => {})}
        >
          <Copy size={16} aria-hidden="true" />
          Copy localhost:{row.port}
        </button>
        <button
          type="button"
          className="button is-danger"
          disabled={locked}
          onClick={() => onStop(row)}
          title={locked ? (process.protection_reason ?? undefined) : undefined}
        >
          <Power size={16} aria-hidden="true" />
          Stop {process.name}
        </button>
        {locked && process.protection_reason && <p className="hint">{process.protection_reason}</p>}
      </div>
    </aside>
  );
}
