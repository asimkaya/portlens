import { ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  shown: number;
  elevated: boolean | null;
  onRestartAsAdmin(): void;
}

export function StatusBar({ shown, elevated, onRestartAsAdmin }: Props) {
  return (
    <footer className="statusbar">
      <span>
        {shown} {shown === 1 ? "port" : "ports"}
      </span>

      {elevated === true && (
        <span className="permission is-admin">
          <ShieldCheck size={15} aria-hidden="true" />
          Running as administrator
        </span>
      )}
      {elevated === false && (
        <span className="permission">
          Some processes can only be stopped as administrator.
          <button type="button" className="link-button" onClick={onRestartAsAdmin}>
            <ShieldAlert size={15} aria-hidden="true" />
            Restart as administrator
          </button>
        </span>
      )}
    </footer>
  );
}
