import type { NotebookNavigatorAPI, TagMetadata } from "../notebook-navigator";

export function normalizeTag(tag: string): string {
	return tag.startsWith("#") ? tag.slice(1) : tag;
}

export function basenameFromTag(tag: string): string {
	return tag.slice(tag.lastIndexOf("/") + 1).replaceAll("#", "");
}

export function extractTagFromHref(href: string): string {
	return href.startsWith("#") ? href.slice(1) : href;
}

export function getParentTagLevels(tag: string): string[] {
	const normalized = normalizeTag(tag);
	const segments = normalized.split("/").filter(Boolean);
	const parents: string[] = [];

	for (let i = segments.length - 1; i > 0; i--) {
		parents.push(segments.slice(0, i).join("/"));
	}

	return parents;
}

export function getTagMetaWithInheritance(api: NotebookNavigatorAPI, rawTag: string): TagMetadata | null {
	const tag = normalizeTag(rawTag);
	const ownMeta = api.metadata.getTagMeta(tag);
	const inherited: TagMetadata = ownMeta ? { ...ownMeta } : {};
	const needsColor = !ownMeta?.color;
	const needsBackgroundColor = !ownMeta?.backgroundColor;

	if (needsColor || needsBackgroundColor) {
		for (const parentTag of getParentTagLevels(tag)) {
			const parentMeta = api.metadata.getTagMeta(parentTag);
			if (!parentMeta) {
				continue;
			}

			if (needsColor && parentMeta.color) {
				inherited.color = parentMeta.color;
			}

			if (needsBackgroundColor && parentMeta.backgroundColor) {
				inherited.backgroundColor = parentMeta.backgroundColor;
			}

			if (inherited.color && inherited.backgroundColor) {
				break;
			}
		}
	}

	return Object.keys(inherited).length ? inherited : null;
}
