# Contributing to Notebook Tags

## Dev Setup

```bash
git clone https://github.com/robfischer1/obsidian-nn-tags.git
cd obsidian-nn-tags
npm install
npm run dev      # development build (watch mode)
npm run build    # production build (type-check + bundle)
```

## Testing

```bash
npm test         # run vitest test suite
```

Write tests for new functionality. Tests live in `tests/` and use [Vitest](https://vitest.dev/).

## Linting

```bash
npm run lint     # run ESLint
```

The project uses [typescript-eslint](https://typescript-eslint.io/) with the [eslint-plugin-obsidianmd](https://www.npmjs.com/package/eslint-plugin-obsidianmd) recommended config. All code must pass lint before merge.

## Pull Requests

1. Fork the repo and create a feature branch from `main`.
2. Make your changes -- keep commits focused and well-scoped.
3. Ensure `npm run build`, `npm run lint`, and `npm test` all pass.
4. Open a PR against `main` with a clear description of what changed and why.

## Issues

File bugs and feature requests via [GitHub Issues](https://github.com/robfischer1/obsidian-nn-tags/issues).
