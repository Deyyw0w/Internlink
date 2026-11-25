# InternLink

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Deployment

### Vercel (recommended)

1. Push this repository to GitHub.
2. In Vercel, **Add New Project** and import the `InternLink` repository.
3. Vercel detects `vercel.json` and uses these settings automatically:
   - Build command: `bash scripts/generate-env.sh && npm run build && cp dist/InternLink/browser/index.csr.html dist/InternLink/browser/index.html`
   - Output directory: `dist/InternLink/browser`
   - Install command: `npm ci`
4. Add the following **Environment Variables** in your Vercel project settings:
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_ANON_KEY` — your Supabase anon (public) key
5. Deploy. Client-side routes (e.g. `/dashboard`, `/login`) are handled by the catch-all rewrite in `vercel.json`.

The app is deployed as a static SPA with prerendered routes, matching the existing Netlify setup (`netlify.toml`).

### Netlify

The `netlify.toml` at the repo root configures Netlify builds using the same `scripts/generate-env.sh` step. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Netlify's environment variables and deploy.

### Local development

```bash
npm run start
```

Then open `http://localhost:4200/`.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
