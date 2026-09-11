import {
  Ban,
  CircleAlert,
  Flag,
  Hand,
  LifeBuoy,
  MessageCircleQuestion,
  OctagonX,
  Stamp,
  TriangleAlert,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";

/**
 * #107: flag types should read at a glance. Every flag type carries an icon
 * name and a colour in the database; this maps those names onto real icons so
 * "Blocked" is a red stop sign rather than yet another generic outline flag.
 */
const FLAG_ICONS: Record<
  string,
  ComponentType<{ className?: string; style?: CSSProperties }>
> = {
  ban: Ban,
  "circle-alert": CircleAlert,
  flag: Flag,
  hand: Hand,
  "life-buoy": LifeBuoy,
  "message-circle-question": MessageCircleQuestion,
  "octagon-x": OctagonX,
  stamp: Stamp,
  "triangle-alert": TriangleAlert,
  warning: TriangleAlert,
  stop: OctagonX,
};

export const FLAG_FALLBACK_COLOR = "#ef4444";

export function getFlagIcon(icon?: string | null) {
  return FLAG_ICONS[(icon ?? "").toLowerCase()] ?? Flag;
}

export function getFlagColor(color?: string | null) {
  return color || FLAG_FALLBACK_COLOR;
}
