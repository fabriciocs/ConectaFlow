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
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <input
              id={`oauth-session-${item.id}`}
              type="checkbox"
              name="sessionIds"
              value={item.id}
              form="oauth-consent"
              checked={isSelected}
              onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
            />
            <label htmlFor={`oauth-session-${item.id}`} className="min-w-0 flex-1">
              {item.name} <span className="text-muted-foreground">({item.sessionId})</span>
            </label>
            <select
              name={isSelected ? `sessionCapability-${item.id}` : undefined}
              value={capabilities[item.id] ?? "READ"}
              form="oauth-consent"
              disabled={!isSelected}
              onChange={(event) => setCapabilities((current) => ({ ...current, [item.id]: event.target.value as "READ" | "WRITE" }))}
              className="shrink-0 rounded border bg-background px-2 py-1 text-xs"
              aria-label={`Access level for ${item.name}`}
            >
              <option value="READ">READ</option>
              <option value="WRITE">WRITE</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}
