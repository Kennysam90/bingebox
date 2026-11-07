# BingeBox

A cinematic React application with an Express API, SQLite database, account profiles, an admin dashboard and server-side AnimeDoc integration.

## Run locally

Use Node 22 (`nvm use`), then run `npm run setup` if dependencies are missing and `npm run dev` to start the frontend and API. Vite prints the available frontend URL; the API defaults to port 8787. Native SQLite dependencies must be installed with the same Node version used to run the API.

Configuration lives in the ignored `server/.env`; available settings are documented in `server/.env.example`. Keep all API credentials on the server. An `ANIMEDOC_API_KEY` is required. Every public movie and series comes from AnimeDoc; there is no sample catalog or fallback video. Without a configured provider, catalog requests return an explicit service error.

## Features checked against the product brief

| Area | Implementation |
| --- | --- |
| Identity and design | Original BingeBox logo, black/charcoal canvas, red actions, responsive layouts, page transitions and reduced-motion support. |
| Home and discovery | Featured titles with descriptions and ratings; trending, popular, recent, top-rated, continuing and recommended rows; genre discovery and an editorial spotlight. |
| Catalog | Ten public genres in the requested order, movie/series filters, individual years and decades, sorting, pagination and title/genre/year search. Home rows and rankings preserve the provider feed. Browse pages advance the upstream pagination cursor instead of stopping at locally cached titles. Animation includes films, TV animation and anime. Nollywood is a separate Nigerian collection with a Yoruba language filter. |
| Title details | Poster, backdrop, synopsis, release date, duration, labelled IMDb/provider and member scores, available cast/crew, trailers, similar titles and episode selection. |
| Playback | Play/pause, timeline, volume, fullscreen, subtitle conversion, quality selection, protected byte-range streaming, episode navigation and saved progress. |
| Accounts | Signup/login, password recovery, multiple profiles, persistent watchlists, history, ratings and recommendations. |
| Administration | AnimeDoc title search/import, title/category/user management, image and subtitle uploads, authorised video URLs, draft/publish controls and activity analytics. Provider sync preserves editorial changes and remembers deletions. |
| Reliability | Input validation, hashed passwords and recovery tokens, cookie sessions, CSRF checks, provider caching, image resizing, lazy page loading and error/retry states. |

The live catalog imports movie and series metadata from [AnimeDoc](https://www.animedoc.cloud/docs/live-movie-api). Source metadata may omit crew, synopses, ratings or episodes; missing information is not fabricated. Admins can add or correct it. Playback sources are resolved at the start of each playback. Movies use `se=0&ep=0`; TV uses the selected season and episode. Browser-compatible renditions, stable source IDs, an initial metadata byte range, fallback and fresh-source retries support reliable playback. Provider credentials are never included in browser responses.


## Password-reset email

Set `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender) and `APP_URL` to enable delivery through [Resend](https://resend.com/docs/api-reference/emails/send-email). Development without an email provider returns a reset link directly. Production does not expose reset links or log recovery tokens and reports recovery as unavailable if email is not configured.

## Validate

- `npm run typecheck`
- `npm --prefix server test`
- `npm run build`

Regression tests use isolated temporary databases and mock the external API and email delivery. They cover removal of the old sample catalog and demo user, provider-only feeds and pagination, search parsing, animation categories, series episodes, the stream proxy, subtitles, admin import and editorial changes, signup/login, profile isolation, watchlists, ratings, progress, uploads, user suspension and single-use password recovery.

## Hosting

`npm run build` creates the frontend and server output. `npm start` serves both through Express. Production requires `ADMIN_PASSWORD` and `APP_URL`; persist the database and uploads directories. This version uses SQLite and local uploads for one application server. Horizontal scaling requires a shared database/storage architecture and appropriate video delivery capacity. Streaming-provider access does not replace title-specific distribution rights; record source and licensing information in the title editor.
