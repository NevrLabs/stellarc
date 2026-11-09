import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { installDevTimingHygiene } from "@/lib/dev-timing-hygiene";

import "@/styles/app.css";

// NEVR-544 — cap the dev instrumentation buffers at the app root: the
// browser never drains the User Timing buffer, and the resource-timing
// buffer goes full-and-dead at 250. Dev-only; the production build
// dead-code-eliminates the call and the module (see dev-timing-hygiene.ts).
if (import.meta.env.DEV && typeof window !== "undefined") {
	installDevTimingHygiene();
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Stellarc" },
			// Kill the default /favicon.ico request in the static build.
			{ rel: "icon", href: "data:," },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" data-theme="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
