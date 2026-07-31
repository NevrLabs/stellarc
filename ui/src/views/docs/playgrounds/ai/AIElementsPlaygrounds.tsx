import { useState } from "react";
import { Check, Copy, FileText, Globe, ImageIcon, RotateCcw, Share, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from "@/components/ai-elements/task";
import { CodeBlock, CodeBlockHeader, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { Image as AIImage } from "@/components/ai-elements/image";
import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources";
import { MessageActions, MessageAction } from "@/components/ai-elements/message";
import { Attachments, Attachment, AttachmentPreview, AttachmentInfo, AttachmentRemove } from "@/components/ai-elements/attachments";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import { ComponentPlayground } from "../ComponentPlayground";
import { ControlRow } from "../controls";

// ── Reasoning ────────────────────────────────────────────────────
export function ReasoningPlayground() {
  const [streaming, setStreaming] = useState(true);
  const [open, setOpen] = useState(true);
  return (
    <ComponentPlayground title="Reasoning" importLine={'import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning"'}
      controls={<>
        <ControlRow label="Streaming"><Switch checked={streaming} onCheckedChange={setStreaming} /></ControlRow>
        <ControlRow label="Expanded"><Switch checked={open} onCheckedChange={setOpen} /></ControlRow>
      </>}>
      <div className="w-80">
        <Reasoning isStreaming={streaming} open={open} onOpenChange={setOpen}>
          <ReasoningTrigger />
          <ReasoningContent>{"Let me analyze the user's request step by step. First, I need to understand what they're asking for. Then I'll check if there are relevant tools available."}</ReasoningContent>
        </Reasoning>
      </div>
    </ComponentPlayground>
  );
}

// ── Tool ────────────────────────────────────────────────────────
type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";
export function ToolPlayground() {
  const [state, setState] = useState<ToolState>("output-available");
  const [name, setName] = useState("web-search");
  const sampleInput = { query: "stellarc design system", maxResults: 5 };
  const sampleOutput = [{ title: "Stellarc UI Guide", url: "https://example.com/guide" }];
  return (
    <ComponentPlayground title="Tool" importLine={'import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool"'}
      controls={<>
        <ControlRow label="State"><NativeSelect aria-label="Tool state" value={state} onChange={(e) => setState(e.target.value as ToolState)}>{(["input-streaming","input-available","output-available","output-error"] as const).map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}</NativeSelect></ControlRow>
        <ControlRow label="Tool name"><Input aria-label="Tool name" className="h-7 w-28 text-xs" value={name} onChange={(e) => setName(e.target.value)} /></ControlRow>
      </>}>
      <div className="w-80">
        <Tool>
          <ToolHeader type="function-call-web-search" state={state} title={name} />
          <ToolContent>
            <ToolInput input={sampleInput} />
            <ToolOutput output={state === "output-available" ? sampleOutput : null} errorText={state === "output-error" ? "Rate limit exceeded" : null} />
          </ToolContent>
        </Tool>
      </div>
    </ComponentPlayground>
  );
}

// ── Task ────────────────────────────────────────────────────────
export function TaskPlayground() {
  const [label, setLabel] = useState("Searching documentation");
  const [open, setOpen] = useState(true);
  return (
    <ComponentPlayground title="Task" importLine={'import { Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile } from "@/components/ai-elements/task"'}
      controls={<>
        <ControlRow label="Label"><Input aria-label="Task label" className="h-7 w-40 text-xs" value={label} onChange={(e) => setLabel(e.target.value)} /></ControlRow>
        <ControlRow label="Expanded"><Switch checked={open} onCheckedChange={setOpen} /></ControlRow>
      </>}>
      <div className="w-80">
        <Task open={open} onOpenChange={setOpen}>
          <TaskTrigger title={label} />
          <TaskContent>
            <TaskItem>Reading <TaskItemFile>docs/DESIGN_SYSTEM.md</TaskItemFile></TaskItem>
            <TaskItem>Found 3 relevant sections</TaskItem>
          </TaskContent>
        </Task>
      </div>
    </ComponentPlayground>
  );
}

// ── Code-block ──────────────────────────────────────────────────
export function CodeBlockPlayground() {
  const [language, setLanguage] = useState("tsx");
  const [lineNumbers, setLineNumbers] = useState(true);
  const sampleCode = `function greet(name: string) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("Stellarc"));`;
  return (
    <ComponentPlayground title="Code Block" importLine={'import { CodeBlock, CodeBlockHeader, CodeBlockCopyButton } from "@/components/ai-elements/code-block"'}
      controls={<>
        <ControlRow label="Language"><NativeSelect aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>{["tsx","ts","js","python","json","bash","css"].map((l) => <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}</NativeSelect></ControlRow>
        <ControlRow label="Line numbers"><Switch checked={lineNumbers} onCheckedChange={setLineNumbers} /></ControlRow>
      </>}>
      <div className="w-96">
        <CodeBlock code={sampleCode} language={language} showLineNumbers={lineNumbers}>
          <CodeBlockHeader><span className="font-mono">example.{language}</span><CodeBlockCopyButton /></CodeBlockHeader>
        </CodeBlock>
      </div>
    </ComponentPlayground>
  );
}

// ── Image ───────────────────────────────────────────────────────
export function AIImagePlayground() {
  const [state, setState] = useState<"loaded" | "loading" | "error">("loaded");
  const [alt, setAlt] = useState("Generated diagram");
  const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  return (
    <ComponentPlayground title="Image" importLine={'import { Image } from "@/components/ai-elements/image"'}
      controls={<>
        <ControlRow label="State"><NativeSelect aria-label="Image state" value={state} onChange={(e) => setState(e.target.value as "loaded"|"loading"|"error")}>{["loaded","loading","error"].map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}</NativeSelect></ControlRow>
        <ControlRow label="Alt text"><Input aria-label="Alt text" className="h-7 w-32 text-xs" value={alt} onChange={(e) => setAlt(e.target.value)} /></ControlRow>
      </>}>
      <div className="w-48">
        {state === "loaded" && <AIImage base64={sampleBase64} mediaType="image/png" alt={alt} />}
        {state === "loading" && <div className="flex aspect-video items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Generating…</div>}
        {state === "error" && <div className="flex aspect-video items-center justify-center rounded-md border border-destructive/50 bg-destructive/10 text-xs text-destructive">Failed to generate</div>}
      </div>
    </ComponentPlayground>
  );
}

// ── Sources ─────────────────────────────────────────────────────
export function SourcesPlayground() {
  const [count, setCount] = useState(2);
  const [open, setOpen] = useState(true);
  const sampleSources = [
    { href: "https://example.com/docs", title: "Stellarc Design System Guide" },
    { href: "https://example.com/api", title: "Component Registry API" },
    { href: "https://example.com/tokens", title: "Design Token Reference" },
  ].slice(0, count);
  return (
    <ComponentPlayground title="Sources" importLine={'import { Sources, SourcesTrigger, SourcesContent, Source } from "@/components/ai-elements/sources"'}
      controls={<>
        <ControlRow label="Count"><Input aria-label="Source count" type="number" min={1} max={3} className="h-7 w-16 text-xs" value={count} onChange={(e) => setCount(Math.max(1, Math.min(3, Number(e.target.value))))} /></ControlRow>
        <ControlRow label="Expanded"><Switch checked={open} onCheckedChange={setOpen} /></ControlRow>
      </>}>
      <div className="w-80">
        <Sources open={open} onOpenChange={setOpen}>
          <SourcesTrigger count={count} />
          <SourcesContent>{sampleSources.map((s) => <Source key={s.href} href={s.href} title={s.title} />)}</SourcesContent>
        </Sources>
      </div>
    </ComponentPlayground>
  );
}

// ── Actions (MessageActions) ────────────────────────────────────
export function ActionsPlayground() {
  const [copied, setCopied] = useState(false);
  return (
    <ComponentPlayground title="Actions" importLine={'import { MessageActions, MessageAction } from "@/components/ai-elements/message"'}
      controls={<ControlRow label="Copied"><Switch checked={copied} onCheckedChange={setCopied} /></ControlRow>}>
      <MessageActions>
        <MessageAction tooltip={copied ? "Copied!" : "Copy"} label="Copy" onClick={() => setCopied(!copied)}>{copied ? <Check size={14} /> : <Copy size={14} />}</MessageAction>
        <MessageAction tooltip="Retry" label="Retry"><RotateCcw size={14} /></MessageAction>
        <MessageAction tooltip="Share" label="Share"><Share size={14} /></MessageAction>
      </MessageActions>
    </ComponentPlayground>
  );
}

// ── Attachments ─────────────────────────────────────────────────
export function AttachmentsPlayground() {
  const [variant, setVariant] = useState<"grid" | "inline" | "list">("inline");
  const [items, setItems] = useState<AttachmentData[]>([
    { id: "1", type: "file", mediaType: "image/png", filename: "screenshot.png", url: "data:image/png;base64,iVBORw0KGgo=" },
    { id: "2", type: "file", mediaType: "application/pdf", filename: "report.pdf" },
    { id: "3", type: "file", mediaType: "text/plain", filename: "notes.md" },
  ]);
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  return (
    <ComponentPlayground title="Attachments" importLine={'import { Attachments, Attachment, AttachmentPreview, AttachmentInfo, AttachmentRemove } from "@/components/ai-elements/attachments"'}
      controls={<ControlRow label="Layout"><NativeSelect aria-label="Layout" value={variant} onChange={(e) => setVariant(e.target.value as "grid"|"inline"|"list")}>{["grid","inline","list"].map((v) => <NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></ControlRow>}>
      <Attachments variant={variant}>
        {items.map((data) => (
          <Attachment key={data.id} data={data} onRemove={() => remove(data.id)}>
            <AttachmentPreview />
            <AttachmentInfo showMediaType={variant === "list"} />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </ComponentPlayground>
  );
}
