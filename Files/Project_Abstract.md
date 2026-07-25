# Project Abstract: InveXa sTacK 1.1

## 1. Project Context & Vision
**InveXa sTacK** is a next-generation, AI-driven Inventory and Business Management System explicitly designed for modern retail and grocery operations. Moving beyond traditional "ledger-style" inventory trackers, InveXa operates as a "Virtual CFO." Its primary mission is to minimize trapped capital (dead stock), prevent revenue loss (stockouts/expirations), and maximize overall profit margins through real-time data visualization and predictive analytics.

---

## 2. Current Exact Features & Capabilities

### Core Inventory & Point of Sale (POS)
*   **Real-Time Stock Tracking:** Comprehensive SKU-level tracking including Cost Price, Selling Price, Category, and precise Expiry Date monitoring.
*   **Automated Receipt/Invoice Generation:** Built-in POS capabilities that calculate sub-totals, localized taxes, discounts, and instantly generate print-ready receipts.
*   **Data Portability Framework:** Seamless CSV Import/Export functionality, ensuring store owners always control their data and can perform external audits.

### Automated Risk Management
*   **Expiry Tracking System:** Proactively flags items approaching their expiration date (e.g., within 30 days) to allow for quick liquidation.
*   **Low-Stock Thresholds:** Computes days-of-supply remaining and triggers automated alerts before a product reaches complete stockout.
*   **Overstock Warnings:** Identifies capital tied up in slow-moving inventory to halt unnecessary purchasing.

### Business Intelligence & Analytics Dashboard
*   **Theme-Aware Dynamic Visualizations:** A premium Light/Dark mode dashboard powered by Chart.js, rendering Sales Activity Calendars, Category Distributions, and 7-Day Revenue Trends.
*   **Margin & Revenue Hub:** Automatically isolates Top Revenue Drivers, High-Margin Stars, and alerts owners to poorly performing SKUs.
*   **Generative AI Strategy Engine:** Evaluates the entire database to generate localized, plain-English business expansion plans, SEO strategies, and immediate operational remedies.

---

## 3. Future Prospects & Advanced Capabilities

As the architecture scales, the following advanced capabilities represent the future roadmap for InveXa sTacK:

### 1. Prescriptive AI Capital Reallocation (Machine Learning)
*   Transitioning from simple trend analysis to an **XGBoost/LightGBM Ensemble Model**.
*   The system will predict 30-day demand *per SKU* based on historical velocity and external factors (e.g., seasonality, weather, holidays).
*   **Feature:** It will mathematically suggest taking purchasing budget away from forecasted slow-movers and reinvesting it into high-velocity items to maximize working capital.

### 2. Multi-Store Cloud Synchronization & Auth
*   Implementation of robust, role-based access control (RBAC) separating Store Admins from Cashiers.
*   Cloud-synced databases allowing a single owner to track inventory movement, transfer stock, and compare analytics across multiple regional storefronts.

### 3. Automated Supplier Integrations (Auto-PO)
*   When a critical stockout threshold is breached, the system will automatically draft and email a Purchase Order (PO) directly to the registered supplier.

### 4. Markdown & Dynamic Pricing Engine
*   The AI will monitor items in the "Expiring Soon" or "Slow Mover" categories and automatically suggest the exact optimal discount percentage required to liquidate the stock without taking an unnecessary loss.

### 5. Companion Mobile Scanner App
*   A lightweight mobile extension allowing floor workers to quickly audit physical stock, scan incoming supplier barcodes, and instantly sync the counts back to the centralized InveXa database.

---

## 4. References & Research Papers

### Academic Literature (AI & Inventory Management)
*   **S. K. Singh, et al., "A Detailed Analysis of Use of AI in Inventory Management for Technically Better Management,"** *2023 3rd International Conference on Advance Computing and Innovative Technologies in Engineering (ICACITE)*, 2023. [IEEE Xplore Link](https://ieeexplore.ieee.org/document/10126137)
*   **"A Review of Artificial Intelligence in Inventory Management: Methods, Applications and Directions,"** *Int. J. Adv. Comput. Sci. Appl.*, vol. 16, no. 1, 2025. [SAI Link](https://thesai.org/Publications/ViewPaper?Volume=16&Issue=1&Code=IJACSA&SerialNo=15)
*   **"How AI Technologies Are Revolutionizing Inventory Management in the Supply Chain,"** *Preprints.org*, 2025. [Preprints Link](https://www.preprints.org/manuscript/202501.0001/v1)
*   **"Applications of Artificial Intelligence in Inventory Management: A Systematic Review of the Literature,"** *Springer*, 2023. [Springer Link](https://link.springer.com/article/10.1007/s11831-023-09890-4)

### Technology & Framework Documentation
*   **Node.js Documentation:** [https://nodejs.org/en/docs/](https://nodejs.org/en/docs/)
*   **Express.js Guide:** [https://expressjs.com/](https://expressjs.com/)
*   **MongoDB Manual:** [https://www.mongodb.com/docs/manual/](https://www.mongodb.com/docs/manual/)
*   **Mongoose ODM:** [https://mongoosejs.com/docs/guide.html](https://mongoosejs.com/docs/guide.html)
*   **MDN Web Docs (HTML, CSS, JS):** [https://developer.mozilla.org/en-US/](https://developer.mozilla.org/en-US/)
*   **JSON Web Tokens (JWT) Introduction:** [https://jwt.io/introduction](https://jwt.io/introduction)
*   **Google Gemini API Docs:** [https://ai.google.dev/docs](https://ai.google.dev/docs)
*   **Anthropic Claude API Docs:** [https://docs.anthropic.com/claude/docs](https://docs.anthropic.com/claude/docs)

### Security & Concepts
*   **Role-Based Access Control (RBAC) - NIST:** [https://csrc.nist.gov/projects/role-based-access-control](https://csrc.nist.gov/projects/role-based-access-control)
*   **Principle of Least Privilege (CISA):** [https://www.cisa.gov/news-events/news/principle-least-privilege](https://www.cisa.gov/news-events/news/principle-least-privilege)
*   **REST API Best Practices:** [https://restfulapi.net/](https://restfulapi.net/)

