# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Shopify Hydrogen** (headless commerce) storefront built on **Remix**, deployed to **Oxygen**. Storefront for a Japanese kimono rental/retail shop. Started from the Hydrogen demo-store template, heavily customized for rental products, metaobject-driven content, draft-preview, and a contact form.

## Commands

```bash
npm run dev          # local dev on MiniOxygen (port 3000; falls back to 3001+ if taken). Runs codegen.
npm run build        # production build (runs codegen)
npm run preview      # build + serve the production bundle locally
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (.js/.ts/.jsx/.tsx)
npm run format       # prettier --write
npm run codegen      # regenerate GraphQL types → storefrontapi.generated.d.ts
npm run e2e          # Playwright end-to-end tests
npm run e2e:ui       # Playwright UI mode
npx playwright test tests/<file>.spec.ts -g "<test name>"   # run a single e2e test
```

- Use **Node 20** (`.nvmrc` = v20). `package.json` says `>=18`, but the Oxygen deploy needs v20 for the `@tailwindcss/oxide-linux` binary.
- **Run `npm run codegen` after adding/changing any GraphQL query.** Types are consumed as `storefrontapi.generated`.
- A **Husky pre-commit hook** runs `lint-staged` (Prettier). Keep code formatted or commits will reformat it.

## Architecture (the parts that span multiple files)

**Request entry & context.** `server.ts` is the Oxygen worker `fetch` handler: it creates the Storefront, Customer Account, and Cart clients and injects them into the Remix loader context. In loaders/actions you get `context.storefront`, `context.cart`, `context.customerAccount`, `context.session`, and `context.env`. `app/entry.server.tsx` builds the **Content Security Policy** via `createContentSecurityPolicy` — **to embed third-party iframes/scripts (e.g. YouTube) you must add the domain to the directives here** (e.g. `frameSrc`), otherwise the browser blocks them.

**Routing.** Remix file-based routes in `app/routes/`, all under an optional `($locale)` segment. Data is loaded with `context.storefront.query(SOME_QUERY, {variables})`. Queries live colocated in the route file, in `app/data/fragments.ts`, or `app/graphql/`.

**SEO (per-route pattern).** `app/lib/seo.server.ts` exposes `seoPayload.{root,home,product,collection,article,page,policies,...}` that build a `SeoConfig`. Each content route's `loader` returns a `seo` object, and the route exports:

```ts
export const meta = ({matches}) =>
  getSeoMeta(...matches.map((m) => m.data.seo));
```

The root config supplies the site-wide `titleTemplate` and defaults; child configs that omit `titleTemplate` **inherit** it. `getSeoMeta` auto-emits title/description/canonical/OG/Twitter/robots/JSON-LD.

**Metaobject-driven content.** Editable content is stored in Shopify **metaobjects** and queried via `context.storefront.query(metaobjects(type: "...", first: ...))`. Existing types: hero slider, delivery-time classifications, tabi options, and **FAQ** (`type: "faq"`). A metaobject definition must have **Storefront access = PUBLIC_READ** to be readable here, and entries must be ACTIVE.

**Rental product system.** `app/routes/($locale).products.$productHandle.tsx` is the largest/most complex file. Rental UI is driven by `custom.*` product metafields (`is_rental`, `is_furisode`, `is_hakama`, `is_tomesode`, `is_houmongi`, `unavailable_dates`). These are fetched in a **separate** `PRODUCT_RENTAL_METAFIELDS_QUERY` — deliberately kept out of `PRODUCT_QUERY` so codegen types don't churn. Add-on options (安心パック / 刺繍半衿) are separate products fetched **by tag**. Rental nights are inferred from the variant title. See `README.md` for the required Shopify-admin metafield/variant/tag setup.

**Draft preview & contact (server-only libs).**

- `app/lib/admin.server.ts` — previews **draft (unpublished) products**, which the Storefront API cannot return. When a product URL has a valid `?preview_token=` (matching `env.PREVIEW_TOKEN`) and the Storefront query returns null, it fetches the draft via the **Admin API** (`env.PRIVATE_ADMIN_API_TOKEN`) and maps it into the Storefront product shape.
- `app/lib/contact.server.ts` — `/contact` form emails the shop via **Resend** (`RESEND_API_KEY` / `CONTACT_FROM_EMAIL` / `CONTACT_TO_EMAIL`).
- Portable, copy-paste implementation guides for both (plus FAQ metaobjects) live in **`docs/`**.

## Conventions

- **Light mode only.** Do not use Tailwind `dark:` variants or `prefers-color-scheme: dark`; every page is fixed light mode.
- **Do not combine `defer`/`<Await>` with `ClientOnly`.** Loaders and components must not crash when a query returns a changed/empty shape — guard for null.
- **Use generated GraphQL type names.** Don't invent type names; check `storefrontapi.generated.d.ts` for the actual generated names (see `.cursor/rules/ui-component-patterns.mdc`).
- **Horizontal lists** use the swimlane pattern from `ProductSwimlane` (`Section padding="swimlane"`, items `snap-start w-48`), not grid overrides — see the same cursor rule.

## Environment & deployment

- **`.env` is local-only and must stay git-untracked** (this repo is **public**). Production values live in **Oxygen environment variables** (Shopify admin → Hydrogen/Headless channel → Environment variables), set for both Production and Preview; **Oxygen env changes take effect on the next deploy**.
- Feature env vars beyond the Shopify defaults are all **optional** — the feature degrades gracefully (falls back to normal 404 / logs) if unset: `PRIVATE_ADMIN_API_TOKEN`, `PREVIEW_TOKEN`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`. Declare new ones in `env.d.ts` (`interface Env`).
- Deploy is via **GitHub Actions → Oxygen** on push/merge to `main`.
- The Customer Account API (`/account`) needs a public domain (ngrok) configured in the Headless channel for local dev — see `README.md`.
