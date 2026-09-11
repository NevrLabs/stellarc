export function VersionDisplay() {
  const version = __APP_VERSION__;
  const changelogUrl =
    "https://github.com/usekaneo/kaneo/blob/main/CHANGELOG.md";

  // #96: the version is a discreet marker tucked into the bottom-left corner of
  // the sidebar, not a footer element competing for attention.
  return (
    <a
      className="px-1 text-[10px] leading-none text-muted-foreground/50 transition-colors duration-200 hover:text-muted-foreground group-data-[collapsible=icon]:hidden"
      data-testid="version-display"
      href={changelogUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      v{version}
    </a>
  );
}
