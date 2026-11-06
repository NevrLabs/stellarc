import { useNavigate } from "@tanstack/react-router";

import { Ico } from "@/components/ui/icon";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useOrgs } from "@/data/queries";
import { me } from "@/fixtures/data";
import { authClient, useSession } from "@/lib/auth";

function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export function OrgSwitcher() {
	const orgs = useOrgs() ?? [];
	const navigate = useNavigate();
	return (
		<Menu
			variant="org"
			trigger={
				<>
					<span className="mark">NL</span>
					<span className="whitespace-nowrap font-medium">
						{orgs[0]?.name ?? "Nevr Labs"}
					</span>
					<Ico n="chevron-down" sm />
				</>
			}
		>
			{orgs.map((org) => (
				<MenuItem key={org.id} selected={org.id === "nevr"}>
					{org.name}
				</MenuItem>
			))}
			<MenuSeparator />
			<MenuItem onClick={() => navigate({ to: "/resources" })}>
				<Ico n="plus" sm />
				New organization…
			</MenuItem>
		</Menu>
	);
}

export function Avatar() {
	const { data: session } = useSession();
	const user = session?.user;
	const name = user?.name ?? me.name;
	const email = user?.email ?? me.email;
	const initials = user ? initialsOf(name) : me.initials;
	return (
		<Menu
			align="end"
			variant="avatar"
			trigger={<span data-testid="avatar-initials">{initials}</span>}
		>
			<div className="px-2 py-1.5">
				<div className="font-medium">{name}</div>
				<div className="text-xs text-faint">{email}</div>
			</div>
			<MenuSeparator />
			{user ? (
				<MenuItem onClick={() => authClient.signOut()}>
					<Ico n="arrow-up-right" sm />
					Sign out
				</MenuItem>
			) : (
				<MenuItem
					onClick={() =>
						authClient.signIn.magicLink({ email, callbackURL: "/" })
					}
				>
					<Ico n="arrow-up-right" sm />
					Sign in (magic link)
				</MenuItem>
			)}
		</Menu>
	);
}

export function Header({ tabs }: { tabs: React.ReactNode }) {
	return (
		<header className="header">
			<OrgSwitcher />
			{tabs}
			{/* NEVR-505: no aria-label override — the visible content names the
			 * control ("Search Ctrl K"), so the accessible name always
			 * contains the visible label text. */}
			<button type="button" className="search" data-testid="search">
				<Ico n="search" sm />
				<span>Search</span>
				<span className="k">Ctrl K</span>
			</button>
			<Avatar />
			{/* Window controls are Tauri-only; hidden on the web build. */}
		</header>
	);
}
