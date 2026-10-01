import { CircleAlert, CircleCheck } from "lucide-react";

export interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.kind}`}>
          {toast.kind === "success" ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
