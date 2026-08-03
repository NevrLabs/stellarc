import { useEffect, useState } from "react";

type ThemeTable = Record<string, Record<string, string>>;
const TOKENS = ["--bg", "--bg-elev", "--border", "--text", "--text-dim", "--accent", "--ok", "--warn", "--err"];

export function readThemeTables(): ThemeTable {
  const themes: ThemeTable = {};
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSImportRule) { try { if (rule.styleSheet) visit(rule.styleSheet.cssRules); } catch { /* cross-origin */ } continue; }
      if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) { visit(rule.cssRules); continue; }
      if (!(rule instanceof CSSStyleRule)) continue;
      for (const selector of rule.selectorText.split(",")) {
        const match = selector.trim().match(/^:root(?:\[data-theme=["']?([a-z-]+)["']?\])?$/);
        if (!match) continue;
        const bucket = (themes[match[1] ?? "obsidian"] ??= {});
        for (const prop of Array.from(rule.style)) if (prop.startsWith("--")) bucket[prop] = rule.style.getPropertyValue(prop).trim();
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) try { visit(sheet.cssRules); } catch { /* cross-origin */ }
  return themes;
}

export function Themes() {
  const [themes, setThemes] = useState<ThemeTable>({});
  useEffect(() => setThemes(readThemeTables()), []);
  const names = Object.keys(themes);
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground"><strong>Obsidian</strong> and <strong>Daybreak</strong> are CSS-token themes; components never own palette values.</p>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-left"><th className="py-2">Token</th>{names.map(name => <th key={name} className="py-2 capitalize">{name === "light" ? "Daybreak" : "Obsidian"}</th>)}</tr></thead><tbody>{TOKENS.map(token => <tr key={token} className="border-b border-border/40"><td className="py-1.5"><code>{token}</code></td>{names.map(name => <td key={name}><span className="inline-flex items-center gap-2"><span className="size-4 rounded border border-border" style={{background: themes[name][token]}} /><code>{themes[name][token] ?? "—"}</code></span></td>)}</tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">Text and interactive states target WCAG AA contrast in both themes.</p>
  </div>;
}
