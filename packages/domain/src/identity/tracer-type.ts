// STL-15 rework c12: minimal tracer contract shared across layers without
// pulling the app package into domain. Runtime import lives in identity-trace.ts.
export interface TracerLike {
	startSpan(
		name: string,
		options?: { traceparent?: string },
	): {
		end(): void;
		setAttribute(key: string, value: string | number | boolean): void;
		recordError(error: unknown): void;
		with<T>(body: () => Promise<T>): Promise<T>;
	};
}
