# Frontend

Next.js + React + TypeScript frontend for CS Career Hub.

## Stack

- Next.js + React
- TypeScript
- Tailwind CSS
- shadcn-style local UI components
- Lucide React icons
- React Hook Form + Zod

## Commands

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

The resume upload is a frontend-only preview. Files are not sent to a server.

The Skills tab needs migrations 000–005 and a backfill with the Python skills
worker. It reads saved tags, demand reports and learning resources through
`lib/data.ts`; it does not call the worker or extract skills in the browser.
Configure the public Supabase URL and publishable key in `.env.local` or `.env`.
See [Skills setup](../docs/skill_development.md) and the
[roadmap audit](../docs/roadmap_audit.md) for the completed scope and remaining work.
