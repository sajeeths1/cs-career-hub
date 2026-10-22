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

To install dependencies for the entire project, run `python3 setup_project.py`
from the repository root (`python setup_project.py` on Windows). This includes
frontend packages and both Python environments. Individual frontend commands:

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

The Resume center uploads documents to an authenticated Next.js endpoint for
local Python/Tesseract extraction. Install the separate OCR dependencies before
using it; see [resume setup and deployment](../docs/resume_parsing.md). Users
review details and explicitly approve profile fields and skill selections.
Files and full extracted text are not persisted. No new migration is required.

The Skills tab needs migrations 000–005 and a backfill with the Python skills
worker. It reads saved tags, demand reports and learning resources through
`lib/data.ts`; it does not call the worker or extract skills in the browser.
Configure the public Supabase URL and publishable key in `.env.local` or `.env`.
See [Skills setup](../docs/skill_development.md) and the
[roadmap audit](../docs/roadmap_audit.md) for the completed scope and remaining work.
