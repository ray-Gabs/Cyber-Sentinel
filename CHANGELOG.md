# Changelog

All notable changes to Cyber Sentinel are documented here.

---

## [1.2.0] — 2026-05-19

### Bug Fixes

#### Frontend
- **`AlertFeed.tsx`** — Alert count now shows the real database total (e.g. 111,875+) instead of always showing the page size (50). Backend now returns a `PaginatedAlerts` envelope with `total`, `pages`, `page`, `size`, and `items`; the feed stores and displays `totalAlerts` from the response.
- **`AlertFeed.tsx`** — Fixed `TRIAGE_FAILED` alerts being invisible in the Untriaged tab; filter now includes alerts where `ai_verdict === "TRIAGE_FAILED"` alongside `null`.
- **`AlertFeed.tsx`** — Date range filter now works regardless of which verdict tab is active (removed the `if (!filterVerdict)` guard that was blocking it).
- **`AlertFeed.tsx`** — Next page button no longer stays disabled when there are more backend pages to fetch; disabled only when both display and backend pages are exhausted.
- **`Dashboard.tsx`** — Fixed `UNANALYZED` → `UNANALYSED` (British spelling) to match the backend constant; the by-verdict stat was always 0.
- **`exportAnalytics.ts`** — Same `UNANALYSED` spelling fix for analytics export.

#### Backend
- **`soc/service.py`** — `list_alerts()` now runs a `.count()` query and returns `(items, total)` tuple instead of just the page of items; enables accurate pagination metadata in the API response.
- **`soc/router.py`** — `GET /alerts/` now returns a `PaginatedAlertResponse` envelope (`items`, `total`, `page`, `size`, `pages`) instead of a bare list.
- **`soc/triage_pipeline.py`** — Fixed undefined `Alert` name in `run_triage_pipeline`; added the missing local import inside the try block.
- **`ai/providers.py`** — All `ImportError` handler re-raises now use `raise ... from None` (B904), making tracebacks cleaner when an optional AI SDK is not installed.

### Code Quality
- **Ruff** — Codebase-wide `Optional[X]` → `X | None` modernisation (280 auto-fixes, UP045).
- **Ruff** — All 13 `raise` statements inside `except` blocks now chain with `raise ... from exc` (B904) for proper exception chaining.
- **Ruff** — All `zip()` calls that pair heterogeneous iterables use explicit `strict=False` (B905).
- **Ruff** — Unused loop variables renamed with `_` prefix (B007).
- **Ruff** — `# noqa` annotations added for intentional false-positives: `S105`/`S108`/`S110`/`S311`/`N806`/`E501` across config, providers, and report service.
- **Ruff** — `auth/router.py` import block reorganised to eliminate E402 violations.
- **ESLint** — Ternary-as-statement in `AlertFeed.tsx` replaced with `if/else` (`no-unused-expressions`).
- **ESLint** — Unused `AlertSummary` import removed from `alertService.ts`.

### Schema
- **`soc/schemas.py`** — Added `PaginatedAlertResponse` (items, total, page, size, pages).
- **`frontend/src/types/alert.ts`** — Added `PaginatedAlerts` interface.
- **`frontend/src/types/api.ts`** — Re-exports `PaginatedAlerts`.

---

## [1.1.0] — 2026-05-18

### Bug Fixes

#### Frontend
- **`searchService.ts`** — Fixed `/api/search` → `/search` (double `/api` prefix caused 404 on every search query)
- **`AdminNotifications.tsx`** — Fixed `/api/notifications` → `/notifications` (same prefix bug broke admin notification panel)
- **`AdminNotifications.tsx`** — Removed redundant `(user as { role?: string })` type cast; `user.role` is already typed
- **`Register.tsx`** — Fixed post-registration navigation: now correctly sends `{ state: { registered: true } }` to `/login` so the success banner displays
- **`Register.tsx`** — Improved error extraction to handle Pydantic validation arrays and non-Axios errors
- **`useAuth.tsx`** — Fixed 401 race condition: `clearToken()` no longer called for 401 errors (API interceptor handles the redirect; calling it too caused duplicate state updates)
- **`AlertFeed.tsx`** — Restructured `filteredAlerts` useMemo to compute `displayedAlerts` internally, eliminating the `eslint-disable-next-line` suppression; `displayedAlertsRef` now tracks the filtered list, improving keyboard navigation accuracy

#### Backend
- **`soc/tasks.py`** — Extended SOC alert dedup lock TTL from 5 min to 30 min; prevents duplicate triage when a pipeline run exceeds the old TTL
- **`soc/router.py`** — Added admin role check to `GET /alerts/health`; it exposed Wazuh connectivity state to any authenticated user
- **`soc/router.py`** — Added `hmac.compare_digest` check after per-user token fetch in webhook handler to guard against timing-based token inference
- **`pentesting/tasks.py`** — Added `soft_time_limit=600, time_limit=700` to `verify_findings` task; previously it had no timeout and could hang indefinitely
- **`pentesting/tasks.py`** — Fixed scheduled scan double-dispatch race condition: each `ScheduledScan` is now guarded by a Redis NX lock before dispatch, preventing two Beat instances from creating duplicate scans for the same schedule
- **`pentesting/models.py`** — Added sparse index on `Scan.celery_task_id` for fast task cancellation lookups

### New Features

#### API Endpoints
- **`PATCH /api/auth/me/password`** — Users can now change their own password (requires current password verification); audit event logged
- **`DELETE /api/auth/users/{id}`** — Admin can permanently delete a user with full cascade: scans, scheduled scans, SOC projects, custom detection rules, notifications; prevents last-admin deletion
- **`PATCH /api/alerts/batch/override`** — Bulk analyst verdict override for up to 200 alerts at once (TRUE_POSITIVE / FALSE_POSITIVE); useful for suppressing noisy rule bursts
- **`DELETE /api/alerts/{id}`** — Admin-only hard delete of an alert and its associated AI verdicts
- **`GET /api/alerts/{id}/history`** — Returns the audit trail for a specific alert (all triage and override events)
- **`GET /api/audit/stats`** — Enriched from a bare count to a full breakdown: top 10 actions, top 10 users, daily activity for the last 7 days

#### Schema
- **`ChangePasswordRequest`** added to `auth/schemas.py`
- **`BatchOverrideRequest`** added to `soc/schemas.py`
- **`UserResponse`** now includes `wazuh_agent_group` field

### Infrastructure
- **`nginx/nginx.conf`** — Added security response headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- **`nginx/nginx.conf`** — WebSocket location block now forwards `X-Forwarded-For` and `X-Forwarded-Proto` headers to the backend

---

## [1.0.6] — Prior

- Scan scheduling (hourly/daily/weekly/monthly via Celery Beat)
- Finding verification probes
- `setup-vm.sh` provisioner

## [1.0.5]

- Scan accuracy fixes, PDF correlation section, AI coverage matrix, risk score formula

## [1.0.4]

- PDF export rewrite (white design, paginated running header)

## [1.0.3]

- Analytics PDF export module

## [1.0.2]

- SOC compatibility fixes
