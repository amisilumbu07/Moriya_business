import { COPYRIGHT_TEXT } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
      <p>{COPYRIGHT_TEXT}</p>
    </footer>
  );
}
