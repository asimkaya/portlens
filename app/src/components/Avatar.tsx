import { ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { hueOf } from "../format";

export function Avatar({
  name,
  system,
  size = "medium",
}: {
  name: string;
  system: boolean;
  size?: "medium" | "large";
}) {
  const className = `avatar is-${size}${system ? " is-system" : ""}`;
  if (system) {
    return (
      <span className={className} aria-hidden="true">
        <ShieldCheck size={size === "large" ? 24 : 17} />
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ "--hue": hueOf(name) } as CSSProperties}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
