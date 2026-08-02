import { type ReactNode, useState } from "react";

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="collapsible">
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span style={{ fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
