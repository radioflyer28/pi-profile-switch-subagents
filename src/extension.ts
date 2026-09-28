import {
	getAgentDir,
	VERSION,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { installPiProfileSubagentsAdapter } from "./index.ts";

/**
 * Zero-configuration Pi extension entrypoint.
 *
 * It exposes global profiles only and uses explicit persisted project-trust
 * decisions per target cwd. Project profiles remain disabled by default.
 */
export default function piProfileSubagentsAdapter(pi: ExtensionAPI): void {
	const handle = installPiProfileSubagentsAdapter({
		agentDir: getAgentDir(),
		trust: { mode: "persisted" },
		allowProjectProfiles: false,
		piVersion: VERSION,
	});
	pi.on("session_shutdown", () => {
		handle.dispose();
	});
}
