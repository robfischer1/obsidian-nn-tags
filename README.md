# Notebook Tags

An Obsidian plugin that renders [Notebook Navigator](https://github.com/johansan/obsidian-notebook-navigator) tag metadata (icons, colors, background colors) inline throughout Obsidian -- in markdown body tags, frontmatter property tag pills, and the live editor.

## Features

- Replaces rendered tag text with the Notebook Navigator icon plus the tag basename (the segment after the last `/`).
- Applies `color` and `backgroundColor` metadata from Notebook Navigator to tag pills.
- Inherits color and background from parent tags when a child tag has no metadata of its own.
- Works in three rendering contexts:
  - **Reading view** -- markdown `#tag` anchors in rendered notes.
  - **Live editor** -- CodeMirror 6 widget decorations replacing `#tag` tokens.
  - **Frontmatter property pills** -- the `tags` property's multi-select pills in the properties panel.
- Cleans up all decorated elements on plugin unload.

## Requirements

- [Obsidian](https://obsidian.md/) v0.17.0 or later.
- [Notebook Navigator](https://github.com/johansan/obsidian-notebook-navigator) plugin installed and enabled (provides the tag metadata API).

## Installation

### From Obsidian Community Plugins (when available)

1. Open **Settings -> Community plugins -> Browse**.
2. Search for **Notebook Tags**.
3. Select **Install**, then **Enable**.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/robfischer1/obsidian-nn-tags/releases).
2. Create a folder at `<YourVault>/.obsidian/plugins/notebook-tags-plugin/`.
3. Copy the three downloaded files into that folder.
4. Restart Obsidian (or reload plugins) and enable **Notebook Tags** in **Settings -> Community plugins**.

## Usage

Once both this plugin and Notebook Navigator are enabled, tags throughout your vault will automatically render with their Notebook Navigator styling. No additional configuration is needed beyond assigning tag metadata in Notebook Navigator's settings.

### Settings

- **Enable notebook navigator tags** -- Toggle inline tag rendering on or off without disabling the plugin entirely.

## Development

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Run tests
npm test
```

## License

[Apache 2.0](LICENSE)
