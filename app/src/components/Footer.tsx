import { ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  shown: number;
  elevated: boolean | null;
  onRestartAsAdmin(): void;
}

export function Footer({ shown, elevated, onRestartAsAdmin }: Props) {
  return (
    <footer className="footer">
      <span>
        {shown} {shown === 1 ? "port" : "ports"}
      </span>

      {elevated === true && (
        <span className="permission is-admin">
          <ShieldCheck size={14} aria-hidden="true" />
          Administrator
        </span>
      )}
      {elevated === false && (
        <button
          type="button"
          className="link-button"
          onClick={onRestartAsAdmin}
          title="Needed to stop processes that belong to other users or to Windows services"
        >
          <ShieldAlert size={14} aria-hidden="true" />
          Restart as administrator
        </button>
      )}
    </footer>
  );
}
