import { App, PluginSettingTab, Setting } from "obsidian";
import type NotebookTagsPlugin from "./main";

export interface NotebookTagsSettings {
	enableNotebookTags: boolean;
}

export const DEFAULT_SETTINGS: NotebookTagsSettings = {
	enableNotebookTags: true,
};

export class SettingTab extends PluginSettingTab {
	constructor(public app: App, public plugin: NotebookTagsPlugin) {
		super(app, plugin);
	}

	display() {
		const { settings: setting } = this.plugin;
		const { containerEl } = this;
		containerEl.empty();

		const editorSetting = new Setting(containerEl);
		editorSetting
			.setName("Enable notebook navigator tags")
			.setDesc("Render notebook navigator tags inline")
			.addToggle((toggle) => {
				toggle.setValue(setting.enableNotebookTags);
				toggle.onChange(async (value) => {
					setting.enableNotebookTags = value;
					await this.plugin.saveSettings();
				});
			});
	}
}