# "Portal Tech Squad" prototype → features to bring into TechSquad CRM

Source: the colleague's Claude artifact (claude.ai/artifact/TWyYRFKgKHiMBaT2bKi2rV), read on 2026-09-30.
Only its code and features were reviewed. Its embedded data (260 projects, 321 contacts, visit history) is
**not** used: the real data comes from the WebAuthor import (M14).

## What the prototype is
- One web page (plain JavaScript, Portuguese screens). **Everything is stored in the browser** of whoever
  opens it, so nothing is shared between people, there are no logins, and clearing the browser loses it.
- A "view as" switch shows four sides: **Office**, **Technician**, **Client** (portal) and **Site** (public quote form).
- SMS messages are prepared in the client's language and open the **phone's own messaging app** (nothing is sent automatically).
- It has none of our base: permissions, payroll, employees, fleet, inventory, permits, workflows engine, email
  automations. So the two are complementary: **our CRM stays the base; their features are rebuilt on it.**
  Their code can't be copied in directly (different design, browser storage), but the screens, rules and
  wording are a precise blueprint.

## Feature by feature

| # | Feature in the prototype | Do we have it? | How it fits our CRM |
|---|---|---|---|
| **A** | **Scheduling / calendar ("Agenda")**: visits linked to a project, with date, start, expected duration, arrival window told to client (exact / 30 min / 1 h / 2 h), technician (incl. freelancer), service type, instructions for the tech, parking & access notes saved on the site; repeat series (weekly … yearly, 2–24 visits); **double-booking warning**; warnings for delinquent client or missing address. Week view with **drag & drop**, team view (one lane per tech), list view, reschedule without dragging. | No | New **Visits** table linked to Project + Employee. Week / team / list views. Biggest new piece. |
| **B** | **Technician "Today" screen**: next job first, one-tap route for the day (Google Maps multi-stop), Waze / Maps / parking-nearby links, **"On my way" SMS** (client's language), **check-in / check-out** with times, reminder (not a block) when 2+ reports are pending, **end the day** with hours on site, travel time between jobs and day span. | No | Phone home screen for Technicians; check-in/out times on the Visit feed **job costing hours** (Phase 2). |
| **C** | **Structured visit report**: result Completed / Partial / Not done; what was done, materials used, problems, who was on site, parking (where / cost). If partial: reason (8 choices), waiting on whom, **what's missing (one per line)**, what to bring next time, time needed, people needed, who can do it, access info. Per-service **checklist** and **tool list** (Prewiring, Installation, Programming, Electrical). Photos, customer **signature**, **voice dictation**. | Partly: our **Job Report** (WebAuthor fields, pending 1–5, photos) | **Extend Job Report** (keep every WebAuthor field; add the structured ones) and link it to the Visit. "Materials used" later feeds inventory. |
| **D** | **Automatic return card**: a partial report creates a follow-up task for the scheduler (Jessica) with the missing items as a checklist, due date by reason (e.g. missing material 3 days, waiting on GC 5 days), status; a **2nd partial in a row alerts the office**; "schedule return" turns it into a visit; the next tech gets a **briefing** (done / missing / bring / access / last photos). | Partly: pending items → project checklist (automation) | New automation + task fields; briefing shown on the Visit. |
| **E** | **Tasks board (Kanban)**: To do / In progress / Waiting / Done, labels (Urgent, Material, Client, Financial, Technical, Return), checklist, comments, due-date badges, **private tasks**, assignee (office or tech), linked project, "put on the calendar". | Partly: our **Tasks** (member, status, due) + checklists | Add board view, labels, comments, private flag, visit link to our Tasks table. |
| **F** | **Sales pipeline board ("Funil")**: Lead → Site survey → Proposal sent → Approved → Infrastructure → Installation → Programming → Complete / On hold / Lost, drag between stages; salesperson, lead source; **auto tasks** on stage change (follow-up 3 days after proposal, schedule start after approval, ask review + offer maintenance plan after completion). | Partly: our Project **workflow** has the same stages | Board view on top of the workflow; the auto tasks become **automations** (data, editable). |
| **G** | **Client 360° card**: contacts, one **timeline** of calls / SMS / emails / visits / stage changes / notes, documents with **expiry dates** (plans, COI, permit, contract) and "visible to client", deal values, reports and open items, past-visit history. | Partly: project page, notes, history, files | Add a communication log + timeline, document type/expiry/visible-to-client on attachments. |
| **H** | **Partners** (GCs, designers, builders, referrers) with stats: number of projects, approved value. | Partly: **Organizations** | Stats panel on Organization. |
| **I** | **"Today" dashboard for the office**: counts (visits today, in the field now, **late — no check-in 15 min after start**, tasks due in 7 days, new leads, renewals); in field now (flag when over the planned time), late with "call the tech", **suggested follow-ups** (lead never contacted, proposal with no contact for 7+ days, approved with no visit), returns needed, **maintenance renewals** (annual visit due / plan expired), **ask for a review** (after completed visits, SMS with Google review link), documents expiring in 30 days, delinquent clients with visits in the next 14 days, visits without an address. | Partly: My Assigned / My Tasks / Recently Modified | Extend our dashboard with these sections. |
| **J** | **Reports**: pipeline by stage with values, approved / invoiced / paid and receivable, partners by value, salespeople, operations (visits done / partial, **real vs planned duration by service type**, visits per tech), maintenance plans (active / expired, revenue by tier, completed projects without a plan), data quality. | No | Reports page over our real tables (fast in SQL). |
| **K** | **Data quality**: completeness (phone / email / address), **duplicate detection and merge**, settings (Google review link). | No | Admin screen; merge must move links, notes, files. |
| **L** | **Message templates in the client's language** (English / Portuguese / Spanish): on my way, visit confirmation, proposal follow-up, review request, plan renewal, first contact; every send logged on the client. | No | Language field on Contact; templates editable by admins; send via phone app (free) or automatically (Twilio). |
| **M** | **Client portal**: next visit with arrival window and live status (scheduled / on the way / on site), request to reschedule, visit history with report summary and photos, shared documents, maintenance plan and plan offers (Bronze $899.99 / Silver $1,349.99 / Gold $2,125.99 / Custom), service request form, all in the client's language. | No | Customer logins with strict row-level security (they see only their own projects). |
| **N** | **Website quote form** (Wix): creates a lead, or attaches to the existing client when phone/email match, plus a "call back" task. | No | Public form endpoint with spam protection. |
| **O** | Quality of life: **global search (Ctrl+K)** with recent items, **notification bell** for things needing attention, **undo** after actions, first-steps guide, help / shortcuts, auto / light / dark theme. | Partly (theme) | Add search, bell, undo. |

## Suggested order (each one a milestone like M1–M12, tested and checked on the phone)

1. **F1 Scheduling & dispatch** (A): Visits, calendar views, conflicts, series.
2. **F2 Field day** (B, C, D): Today screen, check-in/out, extended Job Report, return cards, briefing, hours.
3. **F3 Office "Today" dashboard** (I) and **tasks board** (E).
4. **F4 Pipeline board + auto tasks** (F), **client timeline, templates, partners** (G, H, L).
5. **F5 Reports and data quality** (J, K).
6. **F6 Client portal and website form** (M, N): needs customer logins and a security review.
7. **F7 Search, notifications, undo** (O): can be sprinkled in earlier.

F1–F3 are what the team would use every day, so they are worth having **before go-live**; the WebAuthor
import (M14) still comes last, as agreed.

## Decisions needed from Fred (and the colleague)
1. **Report**: extend our Job Report with the structured fields (recommended) or keep a separate visit report?
2. **Service types, tool lists and checklists**: use the prototype's four (Prewiring, Installation, Programming, Electrical) as the starting list?
3. **Returns**: is Jessica the scheduler who receives every return card? Keep the due days per reason?
4. **SMS**: open the phone's messaging app (free, as in the prototype) or send automatically via Twilio (a few cents each)?
5. **Languages**: screens stay in English; client messages and the portal in English / Portuguese / Spanish?
6. **Maintenance plan prices** (Bronze / Silver / Gold / Custom): are these the real ones?
7. **Client portal**: build before go-live or after?
