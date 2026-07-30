const TOKENS = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-full"];
export function Radius() { return <div className="flex flex-wrap gap-5">{TOKENS.map(token => <div key={token} className="text-center"><span className="block size-16 border border-border bg-muted" style={{borderRadius: `var(${token})`}} /><code className="text-xs">{token}</code></div>)}</div>; }
