import { Button } from "@/components/ui/button";
/**
 * Composer — the chat input bar.
 *
 * Layout:
 *   [ textarea …………………………………………………………………… ]
 *   [ (+) model  |  thinking · context · send ]
 *
 * LEFT group: (+) attachments | provider/model selector
 * RIGHT group: thinking level | context preset | send/stop
 *
 * Two modes:
 * - IDLE (no turn running): textarea = prompt, send button sends the message.
 * - RUNNING (turn in flight): the send button becomes a STOP button (square).
 *   Typing into the textarea + Enter injects a STEER (interrupt) into the
 *   running turn instead of starting a new one. A small hint above the bar
 *   shows "steer running turn" so the user knows what Enter will do.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Icon } from "../../../components/Icon";
import { BrandIcon, agentBrand } from "../../../components/BrandIcons";
import { useAgentCatalog, useModels } from "../../../hooks/queries";
import type { ModelEntry } from "../../../types";

const THINKING_KEY = "stellarc-thinking";
const CONTEXT_KEY = "stellarc-context-preset";

type ThinkingLevel = "off" | "low" | "medium" | "high";
type ContextPreset = "default" | "256k" | "1m";

function loadThinking(): ThinkingLevel {
  try {
    const v = localStorage.getItem(THINKING_KEY);
    return (v as ThinkingLevel) ?? "off";
  } catch {
    return "off";
  }
}

function saveThinking(v: ThinkingLevel) {
  try {
    localStorage.setItem(THINKING_KEY, v);
  } catch {
    // ignore
  }
}

function loadContextPreset(): ContextPreset {
  try {
    const v = localStorage.getItem(CONTEXT_KEY);
    if (v === "256k" || v === "1m" || v === "default") return v;
    return "default";
  } catch {
    return "default";
  }
}

function saveContextPreset(v: ContextPreset) {
  try {
    localStorage.setItem(CONTEXT_KEY, v);
  } catch {
    // ignore
  }
}

const CONTEXT_LABELS: Record<ContextPreset, string> = {
  default: "Default",
  "256k": "256K",
  "1m": "1M",
};

export function Composer({
  text,
  onTextChange,
  onKeyDown,
  onSend,
  onStop,
  sending,
  sessionModel,
  sessionAgent,
  sessionNode,
  placeholder,
}: {
  text: string;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: (model?: string, thinking?: string, contextPreset?: string) => void;
  onStop: () => void;
  sending: boolean;
  sessionModel: string | null;
  sessionAgent: string | null;
  sessionNode: string | null;
  placeholder?: string;
}) {
  const { data: catalog } = useAgentCatalog();
  const nodeAgents = catalog?.nodes.find((node) => node.nodeId === sessionNode)?.agents ?? [];

  // Agent IDs are only unique within a node; resolve the session's exact node first.
  const lockedAgent = nodeAgents.find(
    (agent) => agent.id === sessionAgent || (sessionAgent == null && agent.isDefault),
  );
  const agentIcon = agentBrand(lockedAgent?.kind, lockedAgent?.provider);
  const agentName = lockedAgent?.id ?? sessionAgent ?? "agent";
  // The main in-process node reports as "local"; show it as "stellarc".
  const nodeLabel = !sessionNode || sessionNode === "local" ? "stellarc" : sessionNode;

  // Models: prefer agent-scoped, fall back to global catalog.
  const { data: globalModels } = useModels();
  const agentModels = lockedAgent?.models ?? [];
  const allModels = agentModels.length > 0 ? agentModels : (globalModels?.models ?? []);
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, ModelEntry[]>();
    for (const m of allModels) {
      const key = m.provider ?? "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [allModels]);

  const [modelOpen, setModelOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [thinking, setThinking] = useState<ThinkingLevel>(loadThinking);
  const [contextPreset, setContextPreset] = useState<ContextPreset>(loadContextPreset);
  // Local override when the user picks a different model for the next send.
  // Falls back to session truth (Axis-authoritative), then the agent default.
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const thinkRef = useRef<HTMLDivElement>(null);

  // Reset the override when switching sessions or agents.
  useEffect(() => {
    setModelOverride(null);
  }, [sessionAgent]);

  // The displayed/selected model: local override → session truth → agent default.
  const selectedModel = modelOverride ?? sessionModel ?? lockedAgent?.model ?? "";

  // Close popups on outside click.
  useEffect(() => {
    if (!modelOpen && !plusOpen && !thinkingOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelOpen && modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (plusOpen && plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
      if (thinkingOpen && thinkRef.current && !thinkRef.current.contains(e.target as Node)) {
        setThinkingOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen, plusOpen, thinkingOpen]);

  const setThink = (v: ThinkingLevel) => {
    setThinking(v);
    saveThinking(v);
  };

  const setCtx = (v: ContextPreset) => {
    setContextPreset(v);
    saveContextPreset(v);
  };

  const thinkingLabel =
    thinking === "off" ? "Off" : thinking.charAt(0).toUpperCase() + thinking.slice(1);
  const modelLabel = selectedModel || lockedAgent?.model || "auto";

  const sendArgs = (): [string | undefined, string | undefined, string | undefined] => [
    selectedModel || undefined,
    thinking === "off" ? undefined : thinking,
    contextPreset === "default" ? undefined : contextPreset,
  ];

  return (
    <div className="composer">
      <div className="comp-box">
        <textarea
          rows={1}
          className="composer-input"
          placeholder={sending ? "Keep typing to queue follow-up changes…" : (placeholder ?? "Type a message…")}
          value={text}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <div className="comp-bar">
          {/* LEFT: + menu + model/provider selector */}
          <div className="comp-l">
            <div className="selwrap" ref={plusRef} style={{ position: "relative" }}>
              <Button
                type="button"
                className="plusbtn"
                title="Attach, mention…"
                aria-label="Add attachment or mention"
                onClick={() => setPlusOpen((v) => !v)}
              >
                <Icon name="plus" size={16} />
              </Button>
              {plusOpen && (
                <div className="menu pluspop" style={{ display: "flex" }}>
                  <Button type="button" className="mi" onClick={() => setPlusOpen(false)}>
                    <Icon name="paperclip" size={13} />
                    <span>Attach file</span>
                  </Button>
                  <Button type="button" className="mi" onClick={() => setPlusOpen(false)}>
                    <Icon name="at" size={13} />
                    <span>Mention session</span>
                  </Button>
                  <Button type="button" className="mi" onClick={() => setPlusOpen(false)}>
                    <Icon name="file" size={13} />
                    <span>Reference file</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Model/provider selector (LEFT group) */}
            <div className="selwrap" ref={modelRef} style={{ position: "relative" }}>
              <Button
                type="button"
                className="modelpill"
                title="Select model"
                aria-label="Model"
                aria-haspopup="menu"
                aria-expanded={modelOpen}
                onClick={() => setModelOpen((v) => !v)}
              >
                <span className="nm">{modelLabel}</span>
                <Icon name="chevron-down" size={10} />
              </Button>

              {modelOpen && (
                <div className="menu selpop" style={{ display: "flex" }}>
                  {modelsByProvider.size === 0 && (
                    <div className="gk" style={{ padding: "4px 8px", opacity: 0.6 }}>
                      no models for this agent
                    </div>
                  )}
                  {[...modelsByProvider.entries()].map(([provider, models]) => (
                    <React.Fragment key={provider}>
                      <div className="gk" style={{ padding: "5px 8px 2px" }}>
                        {provider}
                      </div>
                      {models.map((m) => (
                        <Button
                          key={`${provider}-${m.id}`}
                          type="button"
                          className={`mi${selectedModel === m.id ? " on" : ""}`}
                          onClick={() => {
                            setModelOverride(m.id);
                            setModelOpen(false);
                          }}
                        >
                          <span>{m.id}</span>
                          {m.default && <span className="mk2" style={{ opacity: 0.4, fontSize: 9 }}>★</span>}
                          {selectedModel === m.id && <span className="mk2">✓</span>}
                        </Button>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: thinking + context + send/stop */}
          <div className="comp-r">
            {/* Thinking + context combo dropdown */}
            <div className="selwrap" ref={thinkRef} style={{ position: "relative" }}>
              <Button
                type="button"
                className="modelpill"
                title="Thinking level & context"
                aria-label="Thinking and context"
                aria-haspopup="menu"
                aria-expanded={thinkingOpen}
                onClick={() => setThinkingOpen((v) => !v)}
              >
                {thinking !== "off" && <span className="nm">{thinkingLabel}</span>}
                <span className="nm">{CONTEXT_LABELS[contextPreset]}</span>
                <Icon name="chevron-down" size={10} />
              </Button>

              {thinkingOpen && (
                <div className="menu selpop" style={{ display: "flex" }}>
                  <div className="gk" style={{ padding: "5px 8px 2px" }}>thinking</div>
                  {(["off", "low", "medium", "high"] as ThinkingLevel[]).map((lvl) => (
                    <Button
                      key={lvl}
                      type="button"
                      className={`mi${thinking === lvl ? " on" : ""}`}
                      onClick={() => {
                        setThink(lvl);
                      }}
                    >
                      <span>{lvl === "off" ? "Off" : lvl.charAt(0).toUpperCase() + lvl.slice(1)}</span>
                      {thinking === lvl && <span className="mk2">✓</span>}
                    </Button>
                  ))}

                  <div className="cp-div" />

                  <div className="gk" style={{ padding: "5px 8px 2px" }}>context</div>
                  {(["default", "256k", "1m"] as ContextPreset[]).map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      className={`mi${contextPreset === preset ? " on" : ""}`}
                      onClick={() => {
                        setCtx(preset);
                      }}
                    >
                      <span>{CONTEXT_LABELS[preset]}</span>
                      {contextPreset === preset && <span className="mk2">✓</span>}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {sending ? (
              <>
                {text.trim() && (
                  <Button
                    type="button"
                    className="send queue-add"
                    onClick={() => onSend(...sendArgs())}
                    title="Add to queue"
                    aria-label="Queue message"
                  >
                    <Icon name="plus" size={14} />
                  </Button>
                )}
                <Button
                  type="button"
                  className="send stop"
                  onClick={onStop}
                  title="Stop the running turn"
                  aria-label="Stop"
                >
                  <Icon name="stop" size={14} />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="send"
                onClick={() => onSend(...sendArgs())}
                disabled={!text.trim()}
                title="Send"
              >
                <Icon name="arrow-up" size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Meta row — node · agent only. */}
      <div className="comp-meta">
        <span className="cm-item" title={`Running on node: ${nodeLabel}`}>
          <Icon name="server" size={11} />
          <span>{nodeLabel}</span>
        </span>
        <span className="cm-dot" />
        <span
          className="cm-item"
          title={`Agent: ${agentName} (${lockedAgent?.provider ?? "—"}) — locked for this session`}
        >
          <BrandIcon name={agentIcon} size={12} />
          <span>{agentName}</span>
        </span>
        {thinking !== "off" && (
          <>
            <span className="cm-dot" />
            <span className="cm-item" title={`Thinking level: ${thinkingLabel}`}>
              <Icon name="brain" size={11} />
              <span>{thinkingLabel}</span>
            </span>
          </>
        )}
        {contextPreset !== "default" && (
          <>
            <span className="cm-dot" />
            <span className="cm-item" title={`Context: ${CONTEXT_LABELS[contextPreset]}`}>
              <Icon name="list" size={11} />
              <span>{CONTEXT_LABELS[contextPreset]}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
