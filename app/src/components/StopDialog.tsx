import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Row } from "../rows";

interface Props {
  row: Row;
  busy: boolean;
  onCancel(): void;
  onConfirm(tree: boolean): void;
}

export function StopDialog({ row, busy, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tree, setTree] = useState(false);
  const { process } = row;
  const caution = process.protection === "caution";

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="stop-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="stop-title">Stop {process.name}?</h2>
      <p>
        This ends the process (PID {process.pid}) that is using {row.protocol.toUpperCase()} port{" "}
        <strong>{row.port}</strong>, which frees the port. Unsaved work in that program is lost.
      </p>

      {caution && (
        <p className="dialog-warning" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <span>{process.protection_reason}</span>
        </p>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={tree}
          onChange={(e) => setTree(e.target.checked)}
          disabled={busy}
        />
        Also stop the programs it started
      </label>

      <div className="dialog-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button is-danger is-solid"
          onClick={() => onConfirm(tree)}
          disabled={busy}
        >
          {busy ? "Stopping…" : caution ? "Stop anyway" : "Stop process"}
        </button>
      </div>
    </dialog>
  );
}
