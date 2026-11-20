// Adapter registry. The server names the adapter for the running Frappe
// major version; the adapter then confirms with feature detection. No match
// means the engine stays inactive and native Desk is untouched.

import { v16Adapter } from "./v16.js";

export const ADAPTERS = { v16: v16Adapter };

export function selectAdapter(config, env) {
	const adapter = config && ADAPTERS[config.adapter];
	if (!adapter) return null;
	try {
		return adapter.detect(env) ? adapter : null;
	} catch (e) {
		return null;
	}
}
