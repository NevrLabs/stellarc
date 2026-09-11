import { getModifierKeyText } from "@/hooks/use-keyboard-shortcuts";

export const shortcuts = {
  board: {
    prefix: "p",
    create: "c",
    list: "l",
  },
  organization: {
    prefix: "w",
    switch: "s",
    create: "c",
  },
  notification: {
    prefix: "n",
    open: "o",
  },
  sidebar: {
    prefix: getModifierKeyText(),
    toggle: "b",
  },
  palette: {
    prefix: getModifierKeyText(),
    open: "k",
  },
  search: {
    prefix: "/",
  },
  task: {
    prefix: "t",
    create: "c",
    focusTitle: "e",
  },
  view: {
    prefix: "v",
    board: "b",
    gantt: "g",
    list: "l",
    backlog: "k",
  },
  taskDetails: {
    status: "s",
    priority: "p",
    assignee: "a",
    labels: "l",
    dueDate: "d",
  },
  help: {
    key: "?",
  },
} as const;
