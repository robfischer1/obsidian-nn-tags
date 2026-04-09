import NotebookTagsPlugin from "./main";
import type { NotebookNavigatorAPI } from "./notebook-navigator";
import { setIcon } from "obsidian";

declare module "obsidian" {
    interface App {
        plugins: { plugins: Record<string, { api?: NotebookNavigatorAPI }> };
    }
}

export function getNNApi(plugin: NotebookTagsPlugin): NotebookNavigatorAPI | undefined {
    return plugin.app.plugins.plugins['notebook-navigator']?.api;
}

/** Normalize tag: strip leading # and lowercase */
function normalizeTag(tag: string): string {
    return tag.startsWith('#') ? tag.slice(1) : tag;
}

/** Apply NN icon + color to a tag anchor element */
export function applyNNMeta(el: HTMLElement, rawTag: string, nn: NotebookNavigatorAPI) {
    const tag = normalizeTag(rawTag);
    const meta = nn.metadata.getTagMeta(tag);
    const label = tag.slice(tag.lastIndexOf('/') + 1);

    el.empty();
    el.classList.add('nm-tagged');

    if (meta?.icon) {
        const iconEl = el.createSpan({ cls: 'nm-tag-icon' });
        setIcon(iconEl, meta.icon);
        if (meta.color) {
            iconEl.style.color = meta.color;
        }
        el.appendChild(iconEl);
    }

    el.appendChild(document.createTextNode(label));

    if (meta?.color) {
        el.style.setProperty('--nm-tag-color', meta.color);
    } else {
        el.style.removeProperty('--nm-tag-color');
    }

    if (meta?.backgroundColor) {
        el.style.setProperty('--nm-tag-background', meta.backgroundColor);
    } else {
        el.style.removeProperty('--nm-tag-background');
    }
}

export default function registerPostProcessor(plugin: NotebookTagsPlugin) {
    plugin.registerMarkdownPostProcessor(async (el) => {
        const nn = getNNApi(plugin);
        if (!nn) return;

        await nn.whenReady();

        el.findAll("a.tag").forEach((tagEl) => {
            const raw = tagEl.getAttribute('href') ?? tagEl.innerText;
            applyNNMeta(tagEl, raw, nn);
        });
    });
}
