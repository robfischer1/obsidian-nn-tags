import type NotebookTagsPlugin from "../main";
import type { NotebookNavigatorAPI } from "../notebook-navigator";

interface AppWithPlugins {
	plugins: {
		plugins: Record<string, { api?: NotebookNavigatorAPI }>;
	};
}

export class NotebookTagsAPIManager {
	private cachedApi: NotebookNavigatorAPI | undefined;
	private lastCheck = 0;
	private readonly CHECK_INTERVAL = 5000;

	getApi(plugin: NotebookTagsPlugin): NotebookNavigatorAPI | undefined {
		const now = Date.now();
		if (now - this.lastCheck > this.CHECK_INTERVAL) {
			this.cachedApi = this.lookupApi(plugin);
			this.lastCheck = now;
		}
		return this.cachedApi;
	}

	private lookupApi(plugin: NotebookTagsPlugin): NotebookNavigatorAPI | undefined {
		try {
			const appWithPlugins = plugin.app as unknown as AppWithPlugins;
			const api = appWithPlugins?.plugins?.plugins?.["notebook-navigator"]?.api;

			if (api && this.isValidAPI(api)) {
				return api;
			}

			if (!api) {
				console.debug("Notebook Navigator plugin not found or API not available");
			}
			return undefined;
		} catch (error) {
			console.error("Failed to access Notebook Navigator API:", error);
			return undefined;
		}
	}

	private isValidAPI(api: unknown): api is NotebookNavigatorAPI {
		if (!api || typeof api !== "object") return false;
		const obj = api as Record<string, unknown>;
		return typeof obj.metadata === "object" &&
		       typeof obj.navigation === "object" &&
		       typeof obj.whenReady === "function" &&
		       typeof obj.isStorageReady === "function";
	}

	clearCache(): void {
		this.cachedApi = undefined;
		this.lastCheck = 0;
	}
}

export const apiManager = new NotebookTagsAPIManager();
