"use client";

import { useState } from "react";

type SessionOption = {
  id: string;
  sessionId: string;
  name: string;
};

export function OAuthSessionSelector({ sessions }: { sessions: SessionOption[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [capabilities, setCapabilities] = useState<Record<string, "READ" | "WRITE">>({});

  return (
    <div className="max-h-48 space-y-2 overflow-auto">
      {sessions.map((item) => {
        const isSelected = selected[item.id] === true;
        return (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="sessionIds"
              value={item.id}
              form="oauth-consent"
              checked={isSelected}
              onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
            />
            <span>{item.name} <span className="text-muted-foreground">({item.sessionId})</span></span>
            <select
              name={isSelected ? `sessionCapability-${item.id}` : undefined}
              value={capabilities[item.id] ?? "READ"}
              form="oauth-consent"
              disabled={!isSelected}
              onChange={(event) => setCapabilities((current) => ({ ...current, [item.id]: event.target.value as "READ" | "WRITE" }))}
              className="ml-auto rounded border bg-background px-2 py-1 text-xs"
              aria-label={`Access level for ${item.name}`}
            >
              <option value="READ">READ</option>
              <option value="WRITE">WRITE</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
