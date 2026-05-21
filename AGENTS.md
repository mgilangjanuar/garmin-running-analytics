# Project Conventions

## Package Manager

Always use **pnpm**. Never use npm, yarn, or bun.

```bash
pnpm install          # install dependencies
pnpm add <pkg>        # add a dependency
pnpm add -d <pkg>     # add a dev dependency
pnpm dev              # start dev server
pnpm run build        # production build
pnpm run lint         # run linter
```

## Next.js

This project uses **Next.js 16** with App Router and Turbopack. APIs, conventions, and file structure may differ from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

## Code Style

- TypeScript strict mode
- No comments unless explicitly requested
- Use existing UI components from `components/ui/`
- Follow existing naming conventions and file structure
- Client components must have `"use client"` directive
- Server components are the default (no directive needed)

## Garmin Parser

The data pipeline lives in `lib/garmin/`:

- `types.ts` — all TypeScript types (`WorkoutAnalytics` is the master output type)
- `parser.ts` — core parsing engine; reads raw Garmin JSON from `data/`, normalizes units, aggregates trends
- `format.ts` — display formatting (pace, distance, dates)
- `ai-context.ts` — distills `WorkoutAnalytics` into a compact LLM context

Key normalization rules:
- Distance: cm → km (`/ 100,000`)
- Duration: ms → hours (`/ 3,600,000`)
- Speed: dm/s → m/s (`× 10`)
- Sleep/race times: seconds → hours/minutes

## AI Features

- Streaming responses via `streamText` + `toTextStreamResponse()` in `app/api/plan/route.ts`
- Client-side streaming reader in `components/plan/plan-assistant.tsx`
- Markdown rendered with `react-markdown` + Tailwind Typography (`prose`)
- Hydration-safe: `ReactMarkdown` only renders after client mount
