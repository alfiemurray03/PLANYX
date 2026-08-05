# Sousa Murray Planeia Website: Full ChatGPT Handover

**Handover date:** 15 June 2026  
**Project owner:** JA Group Services Ltd  
**Website/service:** Sousa Murray Planeia
**Repository folder:** `C:\Users\alfie\Documents\ja-tours-activities`  
**Production domain:** `https://sousamurrayplaneia.jagroupservices.co.uk`
**Cloudflare Pages project:** `ja-experiences-discovery`  
**GitHub repository:** `https://github.com/alfiemurray03/JA-EXPERIENCES-DISCOVERY`  
**Production branch:** `main`  
**Latest handover baseline commit:** `ec7f6b2` (`Separate shared header and footer styles`)  
**Latest verified deployment:** `https://fd5a1692.ja-experiences-discovery.pages.dev`

---

## 1. Paste-Ready Instructions for a New ChatGPT Session

Use the following as the opening context for any new ChatGPT or Codex session:

> You are continuing development of the Sousa Murray Planeia website for JA Group Services Ltd.
>
> The local repository is `C:\Users\alfie\Documents\ja-tours-activities`. Use British English and maintain a professional UK business tone. Read this handover completely before changing anything.
>
> The service must follow the Board-approved report:
> `Z:\10 IT, Systems and Security\Website\Get Your Guide (tours.jagroupservices.co.uk)\READ ME - Sousa Murray Planeia Board Approved v.3.1.2.pdf`
>
> The current production domain is `https://sousamurrayplaneia.jagroupservices.co.uk`. GitHub `main` automatically deploys the static `public` directory to the Cloudflare Pages project `ja-experiences-discovery`.
>
> Important restrictions:
>
> - Do not remove, alter or bypass the existing `/launch-gateway/` Launch Gateway unless the user expressly authorises the public launch.
> - Do not change `public/_redirects` unless the user expressly requests it and the consequences are explained.
> - Do not describe Sousa Murray Planeia as a travel agent, tour operator, package holiday provider, transport provider or activity supplier.
> - Do not suggest that JA sells flights, visas, transfers, coaches, ferries, trains, taxis, car hire or any transport.
> - Do not enable hotel-room sales or customer hotel payments. There are zero approved selected partner hotels.
> - Do not publish final legal, privacy or cookie claims without approved wording.
> - Do not expose secrets, API keys, partner credentials or customer information.
> - Preserve the current professional editorial travel-hub design unless the user asks for a redesign.
>
> Shared files:
>
> - Header content: `public/assets/includes/header.html`
> - Header styling: `public/assets/includes/header.css`
> - Footer content: `public/assets/includes/footer.html`
> - Footer styling: `public/assets/includes/footer.css`
> - Shared loader and mobile navigation: `public/assets/js/site-shell.js`
> - Main website styling: `public/assets/css/ja-travel-rebuild.css`
>
> All 289 website HTML pages use the shared shell. Do not paste duplicate header or footer markup into individual pages.
>
> Before changing the site, inspect the current files and Git status. Work with existing user changes and do not revert unrelated work. After changes, test locally, check responsive behaviour, preserve the redirects, commit intentionally, push `main`, wait for Cloudflare Pages to deploy, and verify the deployment URL and custom domain.

---

## 2. Executive Project Summary

Sousa Murray Planeia is a trading division/service line of **JA Group Services Ltd**, not a separate legal entity.

The website has been rebuilt from a limited affiliate/tours page into the broader Sousa Murray Planeia planning platform. It now contains:

- A full editorial travel homepage.
- Destination discovery and search.
- 252 generated destination, city and regional guide routes.
- Experience-category pages.
- Family, couples/solo and budget-focused journeys.
- Accessibility-aware support information.
- Paid guidance plans and approved prices.
- A free discovery enquiry route.
- Social tariff information.
- Headout and GetYourGuide partner areas.
- Affiliate disclosure and provider-responsibility wording.
- Accommodation and selected-partner-hotel holding content.
- Important information, complaints and travel/provider disclaimer pages.
- Shared, centrally editable header and footer components.
- A styled Launch Gateway page that currently protects the unfinished public website.

The full website exists behind the Launch Gateway. It is not yet publicly navigable through normal routes because the final redirect sends nearly every route to `/launch-gateway/`.

---

## 3. Board-Approved Service Position

The controlling source is the Board-approved report **v3.1.2**, approved on **12 June 2026**.

### 3.1 Core service

Sousa Murray Planeia is approved as:

- A destination discovery service.
- An activity and experience guidance service.
- An affiliate signposting/referral service.
- A customer-support and planning-guidance service.
- A provider of free and paid written guidance.
- A future controlled route for selected partner hotel rooms, subject to strict conditions.

The service should be practical, inclusive and accessible. It must support different budgets, confidence levels, planning needs, families, carers, couples, solo travellers, customers on lower incomes, disabled customers and people who feel overwhelmed by travel planning.

It must not be positioned only as a luxury service.

### 3.2 Activities and affiliate bookings

Headout is the Board report's **Primary Affiliate Partner**.

GetYourGuide is the **Secondary Affiliate Partner**.

The customer books activities directly with the relevant independent provider. The provider is responsible for:

- The activity or experience.
- Availability.
- Prices.
- Booking terms.
- Tickets.
- Cancellations.
- Refunds.
- Delivery.
- Provider customer support.

JA Group Services Ltd may receive affiliate commission where properly tracked and payable.

The website must never imply that JA Group Services Ltd supplies, controls or guarantees third-party activities.

Historical commercial assumptions recorded by the Board report must be verified before being used for forecasting or public claims:

- Headout partner ID recorded as `JL2D9u`.
- Headout planning assumption recorded as 50% revenue share, with possible higher rates subject to criteria.
- GetYourGuide commission assumption recorded as 8%.
- GetYourGuide partner ID currently used by the website widget script: `ZSEVDSG`.

No Headout API integration may enter production without technical testing, data-protection review, information-security review and Board awareness.

### 3.3 Travel and transport exclusions

Sousa Murray Planeia must not sell, arrange, package, facilitate, advertise or take payment for:

- Package holidays.
- Flights or flight-inclusive arrangements.
- Visas.
- Airport or private transfers.
- Coaches.
- Ferries.
- Trains.
- Taxis or cabs.
- Car hire.
- Any other transport booking.

Customers are responsible for arranging and managing their own travel and transport to and from destinations, hotels, venues, activities and experiences.

### 3.4 Selected partner hotel model

The selected partner hotel model is approved only as a controlled future development area.

Current status:

- **Zero approved selected partner hotels.**
- **No hotel rooms available for sale.**
- **No customer hotel payments may be accepted.**

JA Group Services Ltd may only sell a hotel-room-only booking in its own name where the hotel has granted suitable written commercial rights, supplier authority or partner permission.

The governing rule is:

> No written hotel resale/supplier right means no customer payment to JA Group Services Ltd for that hotel room.

Hotel rooms must remain separate from activity and experience bookings. They must not be combined into one price, checkout or package without a separate Board-approved legal, regulatory, insurance, VAT/accounting and operational review.

Before hotel-room payments can begin, the following are required:

- Approved customer booking terms.
- Selected partner hotel supplier/partner agreements.
- Written resale/commercial authority.
- Booking-confirmation wording.
- Refund and cancellation processes.
- Payment reconciliation and chargeback controls.
- Supplier payment records.
- Complaints processes.
- Privacy and data-protection wording.
- Website legal wording.
- Supplier due diligence.
- Hotel assessment/review forms.
- VAT/accounting and TOMS review.
- Insurance review.
- Further Board readiness review where required.

### 3.5 Complimentary hotel stays

Any complimentary, discounted or review stay offered by a potential hotel partner must be reported to the Board before acceptance.

For overseas stays, the Board must be informed before departure from the United Kingdom. UK stays must also be reported before they take place.

Attendance does not approve a hotel as a partner.

### 3.6 Data and sensitive information

The service may collect:

- Name.
- Email.
- Telephone number where needed.
- Destination preferences.
- Dates.
- Budget.
- Enquiry details.
- Number and type of travellers.
- Interests and preferences.
- Support needs.
- Family needs.
- Accessibility needs where voluntarily provided.
- Payment records for paid services.

Accessibility, disability, medical, family and carer information must only be collected when necessary and voluntarily supplied. It requires careful handling and may constitute special-category data.

### 3.7 Sanctions and destination controls

The Company must not knowingly advertise, promote, list, link to or facilitate content in countries, territories or regions where this would be unlawful, restricted or contrary to applicable UK sanctions guidance.

Destination content must be checked before publication. Uncertainty must be escalated.

---

## 4. Approved Guidance Plans and Pricing

The current website pricing matches the Board-approved report.

| Plan | Standard price | Social tariff | Delivery | Revisions |
|---|---:|---:|---|---|
| Free Discovery Enquiry | £0 | £0 | 1–3 working days | None |
| Destination Discovery Plan | £49 | £29 | 3–5 working days | One minor revision |
| Itinerary and Experience Planning Plan | £89 | £55 | 5–7 working days | One minor revision |
| Complete Discovery and Planning Guidance Plan | £149 | £95 | 7–10 working days | Two minor revisions |

### Plan scope

**Free Discovery Enquiry**

- Initial enquiry and recommendation.
- No detailed research.
- No complete itinerary.
- No destination comparison report.
- No hotel-area research.
- No cost breakdown.

**Destination Discovery Plan**

- Helps a customer decide where to go.
- Considers preferences, budget, dates, traveller type, interests and general needs.

**Itinerary and Experience Planning Plan**

- For customers who already know their destination.
- May include a suggested day-by-day structure.
- May include activity ideas, local notes, useful links, rest time and flexible time.

**Complete Discovery and Planning Guidance Plan**

- The fullest research option.
- May include destination guidance.
- Hotel-area research and accommodation examples.
- Activity research.
- Itinerary ideas.
- Indicative cost breakdowns.
- General preparation notes.

A minor revision is a small adjustment. A changed destination, completely changed dates, changed traveller group or substantially different request should be treated as a new request or paid addition.

### Social tariff

The social tariff may support customers receiving Universal Credit, PIP, other accepted benefits or experiencing financial difficulty.

Only minimum evidence should be requested and it must be handled carefully.

The Board-approved private discretionary lifetime concession is confidential and internal. It must not be advertised, published, offered publicly or added to customer-facing pricing.

---

## 5. Current Visual and Brand Direction

The site has been designed as a **professional planning and creation tools platform**, not a generic affiliate listing page.

### 5.1 Overall visual style

- Modern travel-editorial presentation.
- Large photographic hero sections.
- Strong destination storytelling.
- Spacious maximum-width layouts.
- Premium but approachable visual tone.
- Strong use of editorial numbering such as `01`, `02`, `03`, `04`.
- Large serif display headlines.
- Clean sans-serif body copy.
- Destination and experience cards.
- Split-image/text layouts.
- Structured journey and pricing sections.
- Responsive stacking for tablet and mobile.

### 5.2 Colour palette

Main CSS variables currently include:

- Ink: `#10243f`
- Navy: `#153f6d`
- Blue: `#2567a8`
- Aqua: `#55b8b0`
- Orange: `#f97316`
- Dark orange: `#c94f08`
- Sand/cream: `#f4efe5`
- Mist/soft blue-grey: `#edf5f7`
- Paper: `#ffffff`
- Muted text: `#5d6b7c`
- Border line: `#dbe4ea`
- Green: `#256b58`

The later editorial hub layer also uses:

- Hub navy: `#082a49`
- Hub blue: `#245f94`
- Hub orange: `#ed6a2c`
- Hub cream: `#f4efe6`
- Hub ink: `#10263b`
- Footer background: `#061f36`

### 5.3 Typography

Google Fonts used:

- **Playfair Display** for major editorial headings and premium travel styling.
- **Inter** for body copy, forms and navigation.
- **DM Sans** for selected labels, cards and supporting headings.

Fallbacks include Georgia, Segoe UI and generic sans-serif fonts.

### 5.4 Homepage style

The homepage uses:

- A full-height London hero image.
- Transparent overlaid header.
- Large headline: “Discover more than a destination.”
- Destination search.
- Editorial destination stories for Portugal, Japan, Italy and Morocco.
- Four experience panels.
- Traveller-type links.
- Guidance and pricing presentation.
- Affiliate/independent-booking explanation.
- Strong navy closing call to action.

### 5.5 Launch Gateway style

The Launch Gateway page was redesigned to match the new website:

- Full photographic UK hero.
- Dark navy image overlays.
- Transparent white header.
- Orange accent.
- Editorial Playfair headline.
- Three service pillars.
- GetYourGuide/current-tours signposting.
- Universal shared footer.

### 5.6 Responsive behaviour

Breakpoints are primarily:

- `900px`: tablet and mobile navigation.
- `620px`: small mobile layouts.

Mobile behaviour includes:

- Header menu button.
- White expanded mobile navigation.
- Single-column footer.
- Reduced footer logo width.
- Stacked cards and content sections.
- Adjusted hero typography and spacing.

---

## 6. Shared Header and Footer Architecture

The header and footer were deliberately removed from individual pages to make manual editing easier.

### 6.1 Shared files

Header:

- Markup: `public/assets/includes/header.html`
- Styling: `public/assets/includes/header.css`

Footer:

- Markup: `public/assets/includes/footer.html`
- Styling: `public/assets/includes/footer.css`

Loader:

- `public/assets/js/site-shell.js`

### 6.2 How it works

Every website page contains:

```html
<div id="siteShellHeader"></div>
...
<div id="siteShellFooter"></div>
<script src="/assets/js/site-shell.js"></script>
```

`site-shell.js`:

1. Adds the header and footer CSS files to the document.
2. Fetches `header.html` and `footer.html`.
3. Injects them into the placeholders.
4. Adds `aria-current="page"` using the page's `data-page` value.
5. Handles the mobile menu.
6. Closes the mobile menu when Escape is pressed.
7. Ensures the main element has the ID `main` for the skip link.

All **289 website HTML pages** were audited and confirmed to use:

- The shared loader.
- A shared-header placeholder.
- A shared-footer placeholder.

Do not duplicate header or footer markup inside page HTML.

### 6.3 Current header navigation

- Home
- Discover
- Experiences
- Planning support
- About
- Contact
- Start free enquiry

Header presentation:

- Transparent/white on the homepage.
- White/dark text on ordinary inner pages.
- Transparent/white over the Launch Gateway hero.
- Mobile menu below 900px.

### 6.4 Current footer content

The footer contains:

- Official JA Group Services logo with transparent background.
- Brand statement.
- Email: `contact@jagroupservices.co.uk`
- Telephone: `020 3834 2790`
- Discover links.
- Planning links.
- Company links.
- Legal links.
- Legal identity and registered office.

Current company wording:

> Sousa Murray Planeia is a trading division/service line of JA Group Services Ltd.

> JA Group Services Ltd is incorporated in England and Wales, Company Number 16314179.

Registered office:

> 167–169 Great Portland Street, 5th Floor, London, W1W 5PF, United Kingdom.

The footer logo files are:

- `public/assets/images/ja-group-services-logo-official.png`
- `public/assets/images/ja-group-services-logo-footer-dark.png`

The dark-footer version is currently used.

Footer logo size:

- Desktop: `150px`
- Mobile: `135px`

These values are clearly labelled in `footer.css`.

---

## 7. Repository and Technical Architecture

### 7.1 Main folders

`public/`

- Static website root deployed by Cloudflare Pages.
- Contains all HTML, CSS, JavaScript, images, redirects, headers, sitemap and robots file.

`public/assets/includes/`

- Shared header and footer HTML and CSS.

`public/assets/css/`

- `ja-travel-rebuild.css`: active main website stylesheet used by all 289 pages.
- `destination-experiences.css`: legacy/unreferenced stylesheet.
- `portal.css`: legacy/unreferenced stylesheet.
- `styles.css`: legacy/unreferenced stylesheet.

Do not assume the three legacy stylesheets are active. The audit found every current website page links to `ja-travel-rebuild.css`.

`public/assets/js/`

- `site-shell.js`: shared header/footer and navigation loader.
- `destinations-data.js`: canonical list of 252 destination slugs and names.
- `destination-directory.js`: destination search and country/city filtering.
- `destination-page.js`: client-side rendering for all destination guides.
- `pricing.js`: approved plan and social tariff cards.
- `enquiry-form.js`: front-end enquiry form submission.
- `getyourguide-widgets.js`: GetYourGuide widget rendering.
- `app.js`: older cookie-banner logic; not currently loaded by the audited pages.

`scripts/`

- `generate-destination-pages.mjs`: regenerates destination HTML shells from the destination data list.
- `generate-sitemap.mjs`: regenerates `public/sitemap.xml`.

`src/`

- `worker.js`: Cloudflare Worker enquiry API and static asset handler.

`Private/admin/`

- A private/admin placeholder not inside the public deployment directory.

`docs/`

- Project documentation, including this handover.

### 7.2 Counts

- 291 HTML files including the two shared HTML fragments.
- 289 actual website HTML pages.
- 252 destination guide directories/pages.
- 284 URLs currently listed in `sitemap.xml`.
- 289 pages load `ja-travel-rebuild.css`.
- 289 pages load `site-shell.js`.
- 252 pages load `destination-page.js`.

### 7.3 Destination system

`destinations-data.js` holds 252 destination objects:

```js
{ slug: "london", name: "London" }
```

Each route has a small HTML shell generated by `generate-destination-pages.mjs`.

The detailed page is rendered by `destination-page.js`.

Destination-page content falls into three levels:

1. Detailed manually defined profiles for major countries including the UK, Spain, Portugal, France, Italy, Greece, Japan, Thailand, United States, Canada, Australia, UAE and Morocco.
2. Defined basic country facts for additional countries.
3. Generic city/region fallback copy for remaining routes.

Each generated guide includes:

- Destination hero.
- Overview.
- Region/country.
- Capital or country.
- Currency.
- Suggested trip length.
- Language information.
- Highlights.
- Four-stage suggested planning framework.
- Practical checks.
- GOV.UK foreign travel advice link.
- Accessibility reminder.
- Provider terms and costs reminder.
- Enquiry and pricing calls to action.

Important: many destination pages are generated from shared/generic templates. They are structural pages, not all individually researched editorial guides. They require factual, sanctions and quality review before unrestricted public launch.

### 7.4 Main public page groups

Core:

- `/`
- `/about/`
- `/contact/`
- `/enquiry/`
- `/how-it-works/`
- `/important-information/`
- `/faqs/`
- `/sitemap/`

Discovery:

- `/destinations/`
- `/destinations/{slug}/`
- `/experiences/`
- `/activities/`
- `/family-experiences/`
- `/couples-experiences/`
- `/budget-experiences/`

Planning:

- `/planning-services/`
- `/pricing/`
- `/plan-your-trip/`
- `/ja-travel-support/`
- `/social-tariff/`
- `/accessibility-support/`

Affiliate/provider:

- `/booking-partners/`
- `/getyourguide/`
- `/headout/`
- `/affiliate-disclosure/`
- `/legal/provider-disclaimer/`

Accommodation/transport boundaries:

- `/accommodation/`
- `/local-transport/`
- `/transfers/`
- `/legal/travel-insurance/`

Legal and support:

- `/legal/privacy/`
- `/legal/terms/`
- `/legal/cookies/`
- `/complaints/`
- `/account/`
- `/404.html`

Review/launch:

- `/launch-gateway/`
- `/preview/`

### 7.5 Holding or future content

The following are intentionally incomplete, future-facing or holding areas:

- Selected partner hotels/accommodation.
- Headout production integration.
- Privacy Policy.
- Terms and Conditions.
- Cookie Policy.
- Customer portal/Secure Access.
- Hotel-room sales and payments.
- Some enquiry/payment functionality.

No selected partner hotels should be listed until approved.

---

## 8. Forms and Enquiry API

### 8.1 Front-end forms

`enquiry-form.js` is loaded by:

- `/contact/`
- `/enquiry/`

It:

- Records a start timestamp.
- Pre-fills destination from a query parameter.
- Validates required fields.
- Requires privacy acceptance.
- Requires sensitive-information consent when support/access needs are supplied.
- Requires transport-responsibility confirmation for the Free Discovery Enquiry.
- Posts JSON to `/api/enquiries`.
- Displays a returned reference on success.

### 8.2 Worker API

`src/worker.js` contains:

- `POST /api/enquiries`
- `GET /health`
- Server-side validation.
- Honeypot handling through the `website` field.
- Minimum completion-time check of 2.5 seconds.
- Input length limits.
- Email validation.
- Special-category consent validation.
- Transport-responsibility validation.
- Resend email delivery.
- Enquiry references in the form `JED-YYYYMMDD-XXXXXXXX`.
- Static asset fallback through the `ASSETS` binding.

Required variables/secrets:

- `RESEND_API_KEY`
- `ENQUIRY_FROM_EMAIL`
- `ENQUIRY_TO_EMAIL`

`wrangler.jsonc` defines:

- Worker name: `ja-tours-activities`
- Main module: `src/worker.js`
- Static asset directory: `./public`
- Asset binding: `ASSETS`
- Recipient: `contact@jagroupservices.co.uk`

### 8.3 Critical deployment mismatch

The current production deployment is a **Cloudflare Pages static project** configured as:

- Build command: blank.
- Output directory: `public`.
- Root directory: repository root.
- GitHub automatic deployment.

This Pages configuration does not, by itself, deploy `src/worker.js` as the Pages application's runtime.

At present:

- `/health` is caught by the launch redirect.
- `/api/enquiries` is caught by the launch redirect.
- Forms are not ready to be treated as working production forms.

Before launch, choose and implement one supported architecture:

1. Add a Cloudflare Pages Function for `/api/enquiries`.
2. Deploy the Worker separately and route the API path to it.
3. Migrate the project to a Workers static-assets deployment using `wrangler.jsonc`.

Then:

- Configure Resend securely.
- Verify the sending domain.
- Add secrets to the correct production environment.
- Test validation and successful delivery.
- Test failure responses.
- Confirm privacy and special-category wording.
- Confirm spam and abuse controls.
- Confirm complaint and retention processes.

Do not remove the Launch Gateway while assuming the current static Pages deployment runs the Worker.

---

## 9. GetYourGuide Integration

`public/assets/js/getyourguide-widgets.js` carries forward the original approved asset package.

Current partner ID:

- `ZSEVDSG`

Featured tour widgets:

- United Kingdom Experience: `16403`
- United Kingdom Featured Tour: `53844`
- United Kingdom Countryside: `1020796`
- Portugal Experience: `1170912`
- Spain Experience: `1177`
- France Experience: `203038`
- Italy Experience: `709427`
- Greece Experience: `698`
- Kenya Experience: `479163`
- UAE Experience: `60673`
- Japan Experience: `1035544`
- Thailand Experience: `1027531`
- Australia Experience: `454397`
- Brazil Experience: `530101`

City widget IDs:

- London: `57`
- New York: `16`
- Tenerife: `2603`
- Rome: `33`
- Barcelona: `45`
- Dubai: `173`
- Amsterdam: `59`
- Munich: `36`
- San Francisco: `200`
- Paris: `42`
- Las Vegas: `67`
- Athens: `91`

The script dynamically loads:

`https://widget.getyourguide.com/dist/pa.umd.production.min.js`

The security headers currently permit the required GetYourGuide script, frame and connection sources.

Affiliate wording must remain visible and accurate.

---

## 10. Cloudflare Pages and GitHub Deployment

### 10.1 Git

Local branch:

- `main`

Remote:

- Name: `new-website`
- URL: `https://github.com/alfiemurray03/JA-EXPERIENCES-DISCOVERY.git`

`main` tracks `new-website/main`.

There are also local historical branches:

- `backup-before-service-pages`
- `rebuild-ja-travel-experiences`

Do not merge or switch branches casually. Inspect them before using them.

### 10.2 Cloudflare Pages

Project:

- `ja-experiences-discovery`

Pages subdomain:

- `ja-experiences-discovery.pages.dev`

Custom domain:

- `planyx.jagroupservices.co.uk`
- Status: active.
- Certificate authority: Google.

Source:

- GitHub owner: `alfiemurray03`
- Repository: `JA-EXPERIENCES-DISCOVERY`
- Production branch: `main`
- Automatic deployments: enabled.
- Preview deployments: enabled for all branches.

Build:

- Build command: none.
- Output directory: `public`.
- Root directory: repository root.

Latest verified production deployment:

- Deployment ID: `fd5a1692-360c-4878-a698-b27f9dd358cf`
- URL: `https://fd5a1692.ja-experiences-discovery.pages.dev`
- Commit: `ec7f6b21708d672f70950eae09cd4068c9492b44`
- Status: successful.

### 10.3 Normal publishing workflow

1. Inspect `git status`.
2. Make scoped changes.
3. Test locally.
4. Confirm `public/_redirects` is unchanged unless intentionally authorised.
5. Run syntax and diff checks.
6. Stage only relevant files.
7. Commit to `main`.
8. Push with:

```powershell
git push new-website main
```

9. Wait for Cloudflare Pages to deploy the matching commit.
10. Verify the immutable `pages.dev` deployment URL.
11. Verify the custom domain.
12. Use a cache-busting query or `Ctrl+F5` when checking recently changed assets.

---

## 11. Protected Redirects and Launch Gateway

`public/_redirects` currently contains:

```text
/launch-gateway/ /launch-gateway/index.html 200
/launch-gateway/* /launch-gateway/:splat 200
/assets/* /assets/:splat 200
/preview/ /preview/index.html 200
/preview/* /preview/:splat 200
/* /launch-gateway/ 302
```

Meaning:

- `/launch-gateway/` is directly served.
- Shared assets remain accessible.
- `/preview/` is directly served.
- All other routes redirect to `/launch-gateway/`.

The user has repeatedly instructed that the Launch Gateway page and redirects must remain unchanged unless they explicitly authorise otherwise.

Do not remove the final wildcard redirect as an incidental part of another change.

The full website can be reviewed locally, where Cloudflare's redirect file is not automatically enforced by a simple static server.

---

## 12. Security Headers and Caching

`public/_headers` currently sets:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Frame-Options: SAMEORIGIN`
- Content Security Policy.

Current CSP permits:

- Same-origin content.
- GetYourGuide widgets/scripts.
- Google Fonts styles and fonts.
- HTTPS images.
- GetYourGuide frames and connections.

Caching:

- `/assets/*`: seven-day cache.
- HTML: five-minute cache.

Recently edited CSS/JS may appear stale on the custom domain. Use `Ctrl+F5` or a query-string cache buster during verification.

---

## 13. SEO and Indexing State

`robots.txt` currently allows all crawling and references:

`https://sousamurrayplaneia.jagroupservices.co.uk/sitemap.xml`

The sitemap currently contains 284 URLs.

However, the Launch Gateway redirects almost all routes to Launch Gateway.

Before launch, review:

- Whether the Launch Gateway phase should be indexed.
- Whether temporary `noindex` rules are needed.
- Canonical URLs.
- Open Graph images.
- Destination meta descriptions.
- Sitemap accuracy.
- Generic destination content quality.
- Redirect behaviour after launch.
- Removal or exclusion of routes not intended for public indexing.

`/preview/` already includes `noindex,nofollow`.

---

## 14. Accessibility Approach

Implemented:

- `lang="en-GB"`.
- Skip-to-main-content link in the shared header.
- Focus-visible outlines.
- Semantic navigation.
- Responsive mobile menu.
- Escape-key menu closing.
- Descriptive image alternative text on major editorial images.
- Good contrast in the main design.
- Mobile-readable spacing.
- Clear headings and simple explanatory language.
- Accessibility-aware service and destination wording.

Still required before launch:

- Full keyboard audit.
- Screen-reader audit.
- Form error/announcement audit.
- Colour-contrast verification across every page.
- Reduced-motion review.
- Widget accessibility review.
- Link-purpose review.
- Heading-order review.
- Legal/accessibility statement decision.

Accessibility information must not be presented as a guarantee. Customers should confirm important access details directly with venues, accommodation providers and booking providers.

---

## 15. Important Work Completed

The recent implementation sequence includes:

1. Built the main multi-page Sousa Murray Planeia site structure.
2. Added 252 destination route shells and destination rendering.
3. Added travel imagery and editorial content structures.
4. Added approved plan pricing and social tariff pricing.
5. Added enquiry forms and Worker-side form logic.
6. Added GetYourGuide widgets and original approved city/tour IDs.
7. Added legal, support, provider and service-boundary pages.
8. Added Cloudflare headers, redirects, sitemap and robots files.
9. Restricted public traffic to the Launch Gateway page.
10. Rebuilt the main site into a professional travel-editorial hub.
11. Redesigned the Launch Gateway page to match the main site.
12. Added the official JA Group Services footer logo.
13. Removed the white background from the footer logo.
14. Reduced the footer logo size.
15. Added the correct company identity and registered office.
16. Made the footer universal across the site.
17. Moved header and footer HTML into shared files.
18. Deleted the unused duplicate `layout.js` shell implementation.
19. Moved header and footer CSS into separate editable files beside the component HTML.
20. Audited all 289 pages for shared header/footer linkage.
21. Verified desktop, tablet/mobile, Launch Gateway and inner-page header/footer behaviour.
22. Connected GitHub `main` to automatic Cloudflare Pages production deployment.

Relevant recent commits:

- `050373e` – Deploy complete Sousa Murray Planeia website
- `0c71fe5` – Match Launch Gateway page to travel theme
- `d6605dd` – Add official JA Group Services footer logo
- `ae90b7f` – Remove footer logo background
- `8f4ad77` – Use universal company footer across website
- `fba10e2` – Move header and footer into shared files
- `ec7f6b2` – Separate shared header and footer styles

---

## 16. Known Gaps, Risks and Outstanding Decisions

### Critical before launch

1. **Enquiry API deployment**
   - The static Pages deployment does not currently prove that `src/worker.js` is running.
   - Implement and test the API architecture.

2. **Final legal documents**
   - Privacy, Terms and Cookies are holding pages.
   - Obtain approved customer-facing wording.

3. **Form privacy and sensitive data**
   - Confirm lawful basis, consent wording, retention and handling processes.

4. **Headout verification**
   - Verify current partner ID, terms, attribution, cookie window, payment terms and commission.
   - Do not rely on historical assumptions.

5. **GetYourGuide verification**
   - Verify the active partner account, current commission and widget compliance.

6. **Destination review**
   - Review all destination content for accuracy, sanctions and quality.
   - Many guides use shared generic copy.

7. **Public launch redirect**
   - Remove or alter only with explicit approval and a launch checklist.

8. **Hotel model**
   - Keep disabled until all Board controls are complete.

9. **Payments**
   - Stripe is a future approved route for guidance-plan payments but is not implemented in the current website.
   - Do not add live payment flows without explicit authorisation, approved terms, refund rules and security review.

10. **Testing**
    - Complete responsive, accessibility, link, form, CSP, widget, SEO and browser testing.

### Important but non-blocking development work

- Replace generic destination content with researched editorial content.
- Add unique destination images where licensing permits.
- Finish Headout page when approved partner material is available.
- Decide the future Secure Access/customer portal architecture.
- Review old/unreferenced CSS files and remove only after confirming no hidden dependency.
- Review `/account/` and `Private/admin/` against future portal plans.
- Improve automated tests and link checking.
- Add structured data where appropriate.
- Add social/Open Graph image assets.
- Review cookie behaviour before adding non-essential analytics.

---

## 17. Local Development and Verification

### Static preview

```powershell
python -m http.server 4175 --directory public
```

Then open:

- `http://127.0.0.1:4175/`
- `http://127.0.0.1:4175/launch-gateway/`
- `http://127.0.0.1:4175/preview/`

The static server allows review of routes without Cloudflare applying `_redirects`.

### Worker preview

The README proposes:

```powershell
Copy-Item .dev.vars.example .dev.vars
npx wrangler dev
```

Do not use real production secrets in committed files.

Note: `.dev.vars.example` exists locally but was untracked at the handover baseline. Check Git status before deciding whether to commit it.

### Useful checks

JavaScript syntax:

```powershell
node --check public/assets/js/site-shell.js
```

Whitespace/conflict check:

```powershell
git diff --check
```

Generate destination pages:

```powershell
node scripts/generate-destination-pages.mjs
```

Generate sitemap:

```powershell
node scripts/generate-sitemap.mjs
```

Always inspect the generated diff before committing.

---

## 18. Safe Editing Guide

### Change header wording or links

Edit:

`public/assets/includes/header.html`

### Change header colours, spacing or mobile menu appearance

Edit:

`public/assets/includes/header.css`

### Change footer wording, links, company information or contact details

Edit:

`public/assets/includes/footer.html`

### Change footer colours, spacing, columns or logo size

Edit:

`public/assets/includes/footer.css`

### Change global website styling

Edit:

`public/assets/css/ja-travel-rebuild.css`

### Change the Launch Gateway page content

Edit:

`public/launch-gateway/index.html`

Its page-specific styling currently remains in the main stylesheet, while all header behaviour is in `header.css`.

### Change homepage content

Edit:

`public/index.html`

### Change approved pricing

Edit only after approval:

`public/assets/js/pricing.js`

Also review:

- `public/pricing/index.html`
- `public/planning-services/index.html`
- `public/social-tariff/index.html`
- Homepage pricing strip.

### Add or change destinations

1. Update `public/assets/js/destinations-data.js`.
2. Update profile data in `public/assets/js/destination-page.js` where needed.
3. Run `node scripts/generate-destination-pages.mjs`.
4. Run `node scripts/generate-sitemap.mjs`.
5. Review the complete diff.

### Change redirects

Do not change casually.

File:

`public/_redirects`

Explain the live-production impact before editing.

---

## 19. Launch Checklist

Do not treat the site as launch-ready until all required items are complete.

- Board/customer wording reviewed.
- Privacy Notice approved.
- Terms and Conditions approved.
- Cookie Policy approved.
- Affiliate disclosures verified.
- Complaints routes verified.
- Provider responsibility wording verified.
- Headout commercial and technical details verified.
- GetYourGuide partner details verified.
- Destination content reviewed.
- Sanctions checks completed.
- Forms connected to a working production API.
- Resend domain and secrets configured.
- Email delivery tested.
- Sensitive-information consent tested.
- Data retention and access controls agreed.
- Stripe scope decided and approved before implementation.
- No hotel payment feature enabled.
- No transport/package wording introduced.
- Accessibility audit completed.
- Mobile and browser tests completed.
- Broken-link audit completed.
- CSP reviewed after all third-party integrations.
- Sitemap and robots decisions completed.
- Old tours subdomain transition notice prepared.
- 14-day transition process approved.
- Final Cloudflare deployment verified.
- Board launch-readiness visibility completed where required.
- Only then deliberately change the public redirect.

---

## 20. Final Current-State Statement

As of 15 June 2026:

- The professional Sousa Murray Planeia website is substantially built.
- The full site is stored in GitHub and deployed to Cloudflare Pages.
- The custom domain is active.
- The Launch Gateway page is the current public experience.
- The complete site remains behind the protected Launch Gateway.
- Header and footer HTML and CSS are fully shared and manually editable.
- The current visual direction is a professional editorial travel hub using navy, blue, orange, cream and soft grey.
- The service content broadly follows the Board-approved model.
- Final legal, operational, API, partner-verification, destination-review and launch-readiness work remains.
- There are no approved partner hotels and no hotel-room sales.
- No flights, transport or package holidays are offered.

This handover should be treated as a technical and implementation guide, not a replacement for the Board-approved report, legal advice, tax advice, regulatory advice, approved policies or final operational sign-off.
