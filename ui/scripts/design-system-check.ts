import { existsSync, readFileSync } from "node:fs";
import { registry } from "../src/views/docs/registry";

const uiRoot = process.cwd();
const sourceExceptions: Record<string, string> = {
  chart: "src/views/docs/TanStackChartDemo.tsx",
  combobox: "src/components/ui/command.tsx",
  pagination: "src/components/ui/button.tsx",
};

export function verifyDesignSystem(): string[] {
  const sections = new Set(
    [...readFileSync(`${uiRoot}/src/views/docs/DocsView.tsx`, "utf8").matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]),
  );
  const errors: string[] = [];

  for (const entry of registry.filter(({ status }) => status === "covered")) {
    const source = sourceExceptions[entry.slug] ?? `src/components/ui/${entry.slug}.tsx`;
    if (entry.implementationChoice !== "native" && !existsSync(`${uiRoot}/${source}`)) {
      errors.push(`${entry.slug}: missing ${source}`);
    }
    if (!entry.playgroundKey || !sections.has(entry.playgroundKey)) {
      errors.push(`${entry.slug}: missing playground section ${entry.playgroundKey ?? "(unset)"}`);
    }
  }

  return errors;
}

if (import.meta.main) {
  const errors = verifyDesignSystem();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`design-system:check registry/source/playground parity OK (${registry.length} entries)`);
}
