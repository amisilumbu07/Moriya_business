"use client";

import { useSyncExternalStore } from "react";

export const SKINS = [
  { id: "ocean", label: "Ocean", from: "#0b6fb8", to: "#12a8b8" },
  { id: "forest", label: "Forest", from: "#1a7f45", to: "#5aa626" },
  { id: "sunset", label: "Sunset", from: "#d9480f", to: "#d6336c" },
  { id: "royal", label: "Royal", from: "#6235d6", to: "#a43bc0" },
  { id: "midnight", label: "Midnight", from: "#5b8cff", to: "#8b5cf6" },
] as const;

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const current = () => document.documentElement.dataset.skin ?? "ocean";

function setSkin(id: string) {
  document.documentElement.dataset.skin = id;
  try {
    localStorage.setItem("skin", id);
  } catch {}
  listeners.forEach((l) => l());
}

export function SkinPicker() {
  const skin = useSyncExternalStore(subscribe, current, () => "ocean");
  return (
    <div role="radiogroup" aria-label="Colour theme" className="flex items-center gap-1.5">
      {SKINS.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={skin === s.id}
          aria-label={s.label}
          title={s.label}
          onClick={() => setSkin(s.id)}
          className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-125"
          style={{
            background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
            borderColor: skin === s.id ? "var(--text)" : "transparent",
            transform: skin === s.id ? "scale(1.2)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Runs before first paint so the saved skin never flashes. */
export const skinInitScript = `try{var s=localStorage.getItem("skin");if(s)document.documentElement.dataset.skin=s}catch(e){}`;
