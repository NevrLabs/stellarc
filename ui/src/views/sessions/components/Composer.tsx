import { Button } from "@/components/ui/button";
/**
 * Composer — the chat input bar.
 *
 * Layout:
 *   [ textarea …………………………………………………………………… ]
 *   [ (+) model  |  thinking · context · send ]
 *
 * LEFT: (+) attachments
 * RIGHT: model/provider selector | thinking level | context preset | send/stop
 *
 * Two modes:
 * - IDLE (no turn running): textarea = prompt, send button sends the message.
 * - RUNNING (turn in flight): the send button becomes a STOP button (square).
 *   Typing into the textarea + Enter injects a STEER (interrupt) into the
 *   running turn instead of starting a new one. A small hint above the bar
 *   shows "steer running turn" so the user knows what Enter will do.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Icon } from "../../../components/Icon";
import { BrandIcon, agentBrand } from "../../../components/BrandIcons";
import { useAgentCatalog, useModels } from "../../../hooks/queries";
import type { ModelInfo } from "../../../types";

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

/** Human-readable provider label: strips "custom:" prefix, title-cases. */
function providerLabel(raw: string): string {
  const clean = raw.replace(/^custom:/, "");
  return clean;
}

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
  const allModels: ModelInfo[] = globalModels?.models ?? [];

  // Group models by provider for the picker.
  const providers = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of allModels) {
      const key = m.provider ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allModels]);

  const [modelOpen, setModelOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [thinking, setThinking] = useState<ThinkingLevel>(loadThinking);
  const [contextPreset, setContextPreset] = useState<ContextPreset>(loadContextPreset);
  // Local override when the user picks a different model for the next send.
  // Falls back to session truth (Axis-authoritative), then the agent default.
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const modelRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const thinkRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset the override when switching sessions or agents.
  useEffect(() => {
    setModelOverride(null);
  }, [sessionAgent]);

  // The displayed/selected model: local override → session truth → agent default.
  const selectedModel = modelOverride ?? sessionModel ?? lockedAgent?.model ?? "";

  // Flat filtered list for keyboard navigation.
  const flatFiltered = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return allModels;
    return allModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.displayName ?? "").toLowerCase().includes(q),
    );
  }, [allModels, modelSearch]);

  // Filtered providers (after search).
  const filteredProviders = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of flatFiltered) {
      const key = m.provider ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [flatFiltered]);

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

  // Focus search input when model picker opens.
  useEffect(() => {
    if (modelOpen) {
      setModelSearch("");
      setActiveIndex(0);
      // Defer focus so the input is mounted.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [modelOpen]);

  // Reset active index when search changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [modelSearch]);

  // Scroll active item into view.
  useEffect(() => {
    if (modelOpen && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, modelOpen]);

  const setThink = (v: ThinkingLevel) => {
    setThinking(v);
    saveThinking(v);
  };

  const setCtx = (v: ContextPreset) => {
    setContextPreset(v);
    saveContextPreset(v);
  };

  const pickModel = useCallback(
    (modelId: string) => {
      setModelOverride(modelId);
      setModelOpen(false);
    },
    [],
  );

  const onModelMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = flatFiltered[activeIndex];
      if (m) pickModel(m.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setModelOpen(false);
    }
  };

  const thinkingLabel =
    thinking === "off" ? "Off" : thinking.charAt(0).toUpperCase() + thinking.slice(1);
  const modelLabel = selectedModel || lockedAgent?.model || "auto";

  const sendArgs = (): [string | undefined, string | undefined, string | undefined] => [
    selectedModel || undefined,
    thinking === "off" ? undefined : thinking,
    contextPreset === "default" ? undefined : contextPreset,
  ];

  // Provider count badge.
  const providerCount = providers.length;

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
          </div>

          {/* RIGHT: model + thinking + context + send/stop */}
          <div className="comp-r">
            {/* Model/provider selector */}
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
                {providerCount > 0 && (
                  <span className="pcount" title={`${providerCount} provider${providerCount > 1 ? "s" : ""}`}>
                    {providerCount}
                  </span>
                )}
                <Icon name="chevron-down" size={10} />
              </Button>

              {modelOpen && (
                <div className="menu selpop model-picker" style={{ display: "flex" }} onKeyDown={onModelMenuKeyDown}>
                  {/* Search */}
                  <div className="mp-search">
                    <input
                      ref={searchRef}
                      type="text"
                      placeholder="Search models…"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      onKeyDown={onModelMenuKeyDown}
                    />
                  </div>

                  {/* Model list grouped by provider */}
                  <div className="mp-list">
                    {flatFiltered.length === 0 && (
                      <div className="gk" style={{ padding: "8px", textAlign: "center" }}>
                        No models found
                      </div>
                    )}
                    {(() => {
                      let idx = 0;
                      return filteredProviders.map(([provider, models]) => (
                        <React.Fragment key={provider}>
                          <div className="mp-gk">{providerLabel(provider)}</div>
                          {models.map((m) => {
                            const flatIdx = idx++;
                            const isActive = flatIdx === activeIndex;
                            return (
                              <button
                                key={`${provider}-${m.id}`}
                                ref={(el) => { itemRefs.current[flatIdx] = el; }}
                                type="button"
                                className={`mi mp-item${selectedModel === m.id ? " on" : ""}${isActive ? " active" : ""}`}
                                onMouseEnter={() => setActiveIndex(flatIdx)}
                                onClick={() => pickModel(m.id)}
                              >
                                <span className="mp-name">
                                  {m.displayName ?? m.id}
                                  {m.default && <span className="mp-default" title="Default">★</span>}
                                </span>
                                {selectedModel === m.id && <span className="mk2">✓</span>}
                              </button>
                            );
                          })}
                        </React.Fragment>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>

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
