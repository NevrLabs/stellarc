import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import icons, { iconCategories } from "@/constants/board-icons";
import { cn } from "@/lib/cn";
import { isEmojiIcon } from "@/lib/resolve-icon";
import EntityIcon from "./entity-icon";

const EMOJI_SUGGESTIONS = [
  "🚀",
  "🎯",
  "🐛",
  "🔥",
  "✨",
  "📦",
  "🧪",
  "🛠️",
  "📊",
  "🔐",
  "💡",
  "⚡",
];

type BoardIconPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  searchPlaceholder: string;
  triggerLabel: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  showValue?: boolean;
  triggerContent?: ReactNode;
};

function BoardIconPicker({
  value,
  onValueChange,
  searchPlaceholder,
  triggerLabel,
  disabled = false,
  align = "start",
  side = "bottom",
  showValue = false,
  triggerContent,
}: BoardIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim();
  const filteredIcons = Object.entries(icons).filter(([name]) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );

  const select = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={triggerLabel}
          className={cn(
            showValue
              ? "h-8 w-auto justify-start gap-2 font-normal"
              : "h-8 w-8 p-0",
          )}
          disabled={disabled}
          size={showValue ? "sm" : "icon-sm"}
          title={triggerLabel}
          type="button"
          variant="outline"
        >
          {triggerContent ?? (
            <EntityIcon className="h-4 w-4 text-base" value={value} />
          )}
          {showValue && (
            <span className="truncate text-xs">{value || "Layout"}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="max-h-[min(26rem,var(--available-height))] w-80 overflow-hidden p-2"
      >
        <div className="space-y-2">
          <Input
            aria-label={searchPlaceholder}
            autoFocus
            className="h-8 text-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            role="searchbox"
            value={search}
          />
          {isEmojiIcon(query) && query !== value && (
            <Button
              className="h-10 w-full justify-start gap-2 text-xs"
              onClick={() => select(query)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <span className="text-base leading-none">{query}</span>
              {query}
            </Button>
          )}
          <div className="max-h-[min(270px,calc(var(--available-height)-4rem))] overflow-y-scroll overscroll-contain pr-1 [scrollbar-gutter:stable]">
            {query ? (
              <div className="grid grid-cols-6 gap-1.5">
                {EMOJI_SUGGESTIONS.filter(() => isEmojiIcon(query)).map(
                  (emoji) => (
                    <Button
                      aria-label={emoji}
                      aria-pressed={value === emoji}
                      className={cn(
                        "relative h-10 items-center justify-center rounded-md p-0 text-base leading-none",
                        value === emoji &&
                          "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      key={emoji}
                      onClick={() => select(emoji)}
                      size="sm"
                      title={emoji}
                      type="button"
                      variant="ghost"
                    >
                      {emoji}
                      {value === emoji && (
                        <Check className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-primary p-0.5 text-primary-foreground" />
                      )}
                    </Button>
                  ),
                )}
                {filteredIcons.map(([name, Icon]) => (
                  <Button
                    aria-label={name}
                    aria-pressed={value === name}
                    className={cn(
                      "relative h-10 items-center justify-center rounded-md p-0",
                      value === name &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    key={name}
                    onClick={() => select(name)}
                    size="sm"
                    title={name}
                    type="button"
                    variant="ghost"
                  >
                    <Icon className="h-4 w-4" />
                    {value === name && (
                      <Check className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    )}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(iconCategories).map(([category, names]) => (
                  <div key={category}>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {category}
                    </p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {names.map((name) => {
                        const Icon = icons[name as keyof typeof icons];
                        if (!Icon) return null;
                        return (
                          <Button
                            aria-label={name}
                            aria-pressed={value === name}
                            className={cn(
                              "relative h-10 items-center justify-center rounded-md p-0",
                              value === name &&
                                "bg-sidebar-accent text-sidebar-accent-foreground",
                            )}
                            key={name}
                            onClick={() => select(name)}
                            size="sm"
                            title={name}
                            type="button"
                            variant="ghost"
                          >
                            <Icon className="h-4 w-4" />
                            {value === name && (
                              <Check className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-primary p-0.5 text-primary-foreground" />
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default BoardIconPicker;
