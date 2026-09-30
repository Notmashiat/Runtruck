# Runtruck — instructions for AI coding agents

Read `docs/02-development-architecture.md` before changing anything. It is the rulebook: stack,
where each responsibility lives, quality targets, and how work must be done. The root `README.md`
is the original design-handoff note and is out of date.

Key rules (details in the architecture document, §36):

- The web app is in `app/` (React 19 + Vite + React Router 7). It currently runs on mock data;
  there is no back end yet.
- Work on a `feature/*` or `fix/*` branch. Every branch gets a Vercel preview; check it builds and
  works there.
- Never push or merge to `main` without the owner's explicit approval for that change.
- Follow existing patterns (native `<dialog>` popups, `ui-*` classes, `--ui-*` color tokens for
  light and dark) before introducing new ones.
- Don't change the stack, add infrastructure or add dependencies without a written reason and
  approval.
- Report what changed, how it was verified, and what is left.
