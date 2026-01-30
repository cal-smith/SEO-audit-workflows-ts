# SEO Auditor Frontend

React frontend for the SEO Auditor demo. Works with either the Python or TypeScript backend.

## Tech stack

- React 19
- Vite
- Tailwind CSS
- TypeScript

## Local development

```sh
npm install

npm run dev
```

The frontend runs at `http://localhost:5173` by default.

## Deployment on Render

Deploy as a **Static Site**:

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Static Site**
1. Connect your repository
1. Configure:
   - **Name**: `seo-audit-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
1. Add environment variable:
   - `VITE_API_URL`: Auto-populated from the API service host in `render.yaml`
     - You can override it with a full URL if needed

Or use the included `render.yaml` blueprint.

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL override | `https://seo-audit-api-py.onrender.com` |

## Project structure

```
src/
├── App.tsx              # Main app component
├── api.ts               # API client
├── types.ts             # TypeScript interfaces
├── components/
│   ├── AuditForm.tsx    # URL input form
│   ├── Results.tsx      # Audit results display
│   └── WorkflowPage.tsx # Workflow visualization
├── index.css            # Tailwind + custom styles
└── main.tsx             # Entry point
```
