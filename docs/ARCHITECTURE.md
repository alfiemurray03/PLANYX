# Sousa Murray Planeia Architecture

## Overview

Sousa Murray Planeia is split into two production-facing applications:

- Customer Portal
- Administrator Centre

Both applications share the same Cloudflare Pages/Functions runtime, D1-backed persistence, and branded UI language. Authentication, Microsoft Entra External ID, Microsoft Graph, OIDC, PKCE, session handling, cookies, callback handling, and Stripe authentication remain production-stable and are intentionally isolated from the portal refactors.

## Folder Structure

- `public/` static customer and administrator pages
- `public/assets/js/` shared JavaScript modules
- `public/assets/css/` shared stylesheets
- `functions/` Cloudflare Pages Functions and API routes
- `functions/_shared/` cross-cutting helpers
- `migrations/` D1 schema migrations
- `docs/` platform documentation

## Customer Portal

The customer portal is a shared-shell experience rendered by `public/assets/js/account-portal.js` and styled by `public/assets/css/portal.css`.

Key characteristics:

- Single shell for dashboard, profile, settings, security, membership, support, notifications, data protection, downloads, saved experiences, messages, and bookings.
- Profile editing uses the existing customer profile synchronisation path.
- Support PIN management is handled through dedicated account routes.
- Timeline and summary components are reusable across customer pages.

## Administrator Portal

The Administrator Centre is a section-driven control surface rendered by `public/assets/js/admin-control.js` and styled by `public/admin/assets/admin-saas-v2.css`.

It provides:

- Operations dashboard
- Customer explorer and customer profile workspace
- Support operations
- GDPR / data protection operations
- Notification management
- Membership operations
- Security operations
- CMS / content operations
- Reports and audit views

The admin shell uses a shared sidebar, top bar, action buttons, tables, timelines, badges, empty states, and modal workspaces.

## Shared Component Architecture

Reusable UI patterns are implemented in JavaScript helpers rather than duplicated page markup.

Examples:

- Shell layout
- Table rendering
- Status badges
- Timeline rendering
- Empty states
- Form helpers
- Modal workspaces

## D1 Database Schema

The current schema uses existing profile and admin tables plus operational customer and support tables.

Important tables:

- `profiles`
- `admin_users`
- `admin_roles`
- `admin_permissions`
- `role_permissions`
- `admin_preferences`
- `service_plans`
- `policy_pages`
- `company_branding`
- `support_tickets`
- `data_protection_requests`
- `system_reports`
- `closure_requests`
- `affiliate_content_blocks`
- `admin_audit_log`
- `admin_bypass_sessions`
- `customer_account_flags`
- `customer_timeline_events`
- `customer_support_cases`
- `customer_support_messages`
- `customer_notifications`
- `customer_support_pins`
- `customer_internal_notes`

## Microsoft Entra Integration

Microsoft Entra remains the source of truth for administrator and customer identity.

Rules:

- Do not duplicate Microsoft-managed credentials.
- Do not modify authentication or callback flows during portal work.
- Only expose read-only identity data where required for support operations.

## Stripe Integration

Stripe remains isolated to its own admin configuration and customer billing context.

Rules:

- Authentication is unchanged.
- Secret keys remain masked after save.
- Stripe settings are edited only through the existing operational controls.

## Middleware

Middleware remains unchanged and continues to enforce auth, session, and route protection boundaries.

## API Endpoints

Customer-facing endpoints:

- `/account/profile`
- `/account/requests`
- `/account/pins`

Administrator endpoints:

- `/admin/api?section=overview`
- `/admin/api?section=customers`
- `/admin/api?section=customer`
- `/admin/api?section=support`
- `/admin/api?section=datarequests`
- `/admin/api?section=notifications`
- `/admin/api?section=membership`
- `/admin/api?section=security`
- `/admin/api?section=cms`
- `/admin/api?section=reports`
- `/admin/api?section=audit`

## Shared Workflows

- Customer portal loads profile, requests, and PINs from the shared account functions.
- Administrator portal loads data by section from a single admin API and reuses modal/workspace renderers.
- Customer support, GDPR, notifications, membership, and audit records are written to D1 and surfaced in both portals where applicable.

## Migrations

Schema changes are introduced only when new operational workflows require persistence.

Current pattern:

- Extend existing tables safely with additive columns where practical.
- Create new tables for new operational records.
- Preserve backwards compatibility with existing portal data.

## Operational Workflows

Operational workflows currently covered:

- Customer support queue handling
- GDPR request handling
- Notification draft/edit/send/archive workflows
- Customer internal notes
- Customer flags and timeline events
- Membership summary and operational review
- Audit viewing and export

## Maintenance Notes

All portal refactors should preserve:

- Production authentication paths
- Customer profile synchronisation
- D1-backed history and auditability
- Shared component reuse
- No duplicated identity storage
