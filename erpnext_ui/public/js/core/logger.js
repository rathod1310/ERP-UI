// Console logging with a fixed prefix. Debug output appears only when
// "Log Theme Engine Diagnostics" is enabled; nothing user-identifying is logged.

export function createLogger(prefix = "[erpnext_ui]", target = globalThis.console) {
	let debugEnabled = false;
	const call = (method, args) => {
		try {
			(target[method] || target.log).call(target, prefix, ...args);
		} catch (e) {
			// Logging must never break the page.
		}
	};
	return {
		setDebug(value) {
			debugEnabled = Boolean(value);
		},
		debug: (...args) => debugEnabled && call("debug", args),
		info: (...args) => debugEnabled && call("info", args),
		warn: (...args) => call("warn", args),
		error: (...args) => call("error", args),
	};
}
