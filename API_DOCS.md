<div align="center">
  <img src="public/assets/images/logo.png" alt="OpenStock Logo" width="120" />
  <h1>OpenStock API & Architecture</h1>
  
  <p>
    <b>Modern. Open. Resilient.</b>
  </p>

  <p>
    <img src="https://img.shields.io/badge/status-active-success?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/AI-Gemini%20%2B%20Siray-blueviolet?style=for-the-badge" alt="AI Stack" />
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge" alt="License" />
  </p>
</div>

---

## 🏗️ Architecture Overview

OpenStock leverages a resilient event-driven architecture powered by **Inngest**. We prioritize uptime for our generative features by utilizing a multi-provider AI strategy.

### 🧠 Intelligent Model Routing

We don't rely on a single point of failure. Our AI infrastructure automatically routes around outages.

```mermaid
graph LR
    A[User Action / Cron] -->|Trigger| B(Inngest Function);
    B --> C{Primary Provider};
    C -->|Gemini 2.5 Flash Lite| D[Generate Content];
    C -.->|Error / Rate Limit| E{Fallback Provider};
    E -->|Siray.ai Ultra| D;
    D --> F[Email / Notification];
    
    style C fill:#20c997,stroke:#333,stroke-width:2px,color:black
    style E fill:#3b82f6,stroke:#333,stroke-width:2px,color:white
    style D fill:#fff,stroke:#333,stroke-width:2px,color:black
```

---

## 🤝 AI Partners

### Primary: Google Gemini
The workhorse of our generative content. Fast, efficient, and deeply integrated via Inngest.

### Fallback: Siray.ai
> [!IMPORTANT]
> **Zero Downtime Guarantee.**
> When Gemini wavers, **Siray.ai** takes over instantly. No user request is ever dropped.

<div align="center">
  <br/>
  <a href="https://www.siray.ai/">
    <img src="public/assets/icons/siray.svg" alt="Siray.ai Logo" width="180" />
  </a>
  <p><i>The robust infrastructure backing OpenStock.</i></p>
</div>

---

## ⚡ Serverless Functions (Inngest)

Our background jobs are defined in `lib/inngest/functions.ts`. This is a
private, single-owner deployment, so the multi-user broadcast/re-engagement
jobs that existed upstream (a weekly newsletter and an inactive-user
win-back email, both built on a Kit/ConvertKit integration) were removed —
see `docs/architecture.md`. Only two jobs remain:

| ID | Type | Schedule/Trigger | Purpose |
| :--- | :--- | :--- | :--- |
| `sign-up-email` | 🔔 Event | `app/user.created` | **Personalized Onboarding.** Generates a custom welcome message based on user quiz results (optional — skipped automatically if AI/email aren't configured). |
| `check-stock-alerts` | ⏱️ Cron | `*/5 * * * *` | **Real-time Monitoring.** Checks user price targets against live market data. |

---

## 🔌 API Integrations

Accessed exclusively through `lib/market-data/` (see `docs/market-data.md`)
— nothing else in the app talks to a provider directly.

<details>
<summary><b>📈 Stock Data: Finnhub</b></summary>
<br/>

*   **Base URL:** `https://finnhub.io/api/v1`
*   **Key Features:** Real-time quotes, company profiles/financials, market news, symbol search.
*   **Auth:** `FINNHUB_API_KEY` (server-side only — no `NEXT_PUBLIC_` prefix)
*   **Historical daily bars:** the free tier does not include Finnhub's candle endpoint for most keys; falls back to Stooq's free daily-bar CSV (no key required) — see `docs/market-data.md`.

</details>

<details>
<summary><b>🗄️ Database: MongoDB Atlas</b></summary>
<br/>

*   **Connection:** Standard URI (DNS SRV bypassed for maximum reliability).
*   **Collections:** `users`, `watchlists`, `alerts`.

</details>

---

<div align="center">
  <sub>Documentation © Open Dev Society. Built with ❤️ for the Open Source Community.</sub>
</div>
