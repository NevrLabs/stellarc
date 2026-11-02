/*
 * better-auth client against the stellarc-api (Effect HttpApi). The auth
 * server is mounted at /api/auth by the API (packages/kaneo-legacy auth.ts);
 * the client stays on the same minor as the frozen server until cutover.
 */
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const getBaseURL = () => {
	const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:1337";
	// A relative value means "same origin as the page" (dev proxy).
	if (apiUrl.startsWith("/")) return "";
	try {
		const url = new URL(apiUrl);
		return `${url.protocol}//${url.host}`;
	} catch {
		return apiUrl.split("/").slice(0, 3).join("/");
	}
};

export const authClient = createAuthClient({
	baseURL: getBaseURL(),
	basePath: "/api/auth",
	plugins: [magicLinkClient()],
});

export const { useSession } = authClient;
