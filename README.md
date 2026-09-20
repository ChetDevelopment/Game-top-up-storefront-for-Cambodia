<div align="center">

# 🎮 Game Top-Up Storefront for Cambodia

**A full-stack game top-up platform built with Next.js 16, featuring Bakong KHQR payments for the Cambodian market.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)](https://prisma.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://tykhai.vercel.app)** · [Report Bug](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues) · [Request Feature](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 💳 **KHQR Payments** | Bakong KHQR & ABA PayWay integration for Cambodian banking apps |
| 🎮 **Game Catalog** | Manage games, products, and pricing with admin panel |
| 👥 **User System** | Registration, login, Google OAuth, VIP ranks & wallet |
| 📊 **Admin Dashboard** | Orders, analytics, customers, banners, and settings management |
| 🚀 **Auto Delivery** | GameDrop & G2Bulk API integration for instant game credit delivery |
| 🔒 **Enterprise Security** | CSRF protection, rate limiting, webhook verification, encryption |
| 📱 **Mobile-First** | Responsive design with PWA support for all devices |
| 🔔 **Real-time** | Live delivery feed, Telegram notifications, instant updates |
| 🎁 **Gamification** | Spin wheel, mystery box, daily missions, referral system |
| 💰 **Wallet System** | Built-in wallet with top-up, transfer, and payment features |

---

## 🛠️ Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                              │
│  Next.js 16 · React 18 · Tailwind CSS · Lucide Icons   │
├─────────────────────────────────────────────────────────┤
│                    BACKEND                               │
│  Next.js API Routes · Prisma ORM · Node.js 20+         │
├─────────────────────────────────────────────────────────┤
│                    DATABASE                              │
│  PostgreSQL (Production) · SQLite (Development)         │
├─────────────────────────────────────────────────────────┤
│                    PAYMENTS                              │
│  Bakong KHQR · ABA PayWay · HMAC-SHA256 Verification   │
├─────────────────────────────────────────────────────────┤
│                    DEPLOYMENT                            │
│  Vercel · GitHub Actions · BullMQ · Redis (Upstash)     │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.x
- **PostgreSQL** database (or SQLite for development)
- **Bakong Portal** account for payments ([Register here](https://api-bakong.nbc.gov.kh))

### 1️⃣ Clone & Install

```bash
git clone https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia.git
cd Game-top-up-storefront-for-Cambodia
npm install
```

### 2️⃣ Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings. **Required variables:**

```env
DATABASE_URL="postgresql://user:password@localhost:5432/your_db"
JWT_SECRET="your_32_char_secret_here"
NEXTAUTH_SECRET="your_32_char_secret_here"
ENCRYPTION_KEY="your_32_char_secret_here"
BAKONG_TOKEN="your_bakong_jwt_token"
BAKONG_ACCOUNT="your_email@domain.com"
BAKONG_MERCHANT_NAME="Your Store Name"
BAKONG_WEBHOOK_SECRET="your_webhook_secret"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### 3️⃣ Setup Database

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

### 4️⃣ Start Development

```bash
npm run dev
```

Visit **http://localhost:3000** 🎉

### 🔐 Default Admin Login

| Field | Value |
|-------|-------|
| URL | `http://localhost:3000/admin/login` |
| Email | `admin@example.com` |
| Password | `ChangeMeNow123!` |

> ⚠️ **Change these credentials immediately after first login!**

---

## 📁 Project Structure

```
├── app/                          # Next.js App Router
│   ├── admin/                    # Admin panel (25+ pages)
│   │   ├── orders/               # Order management
│   │   ├── products/             # Product catalog
│   │   ├── settings/             # Site settings
│   │   └── ...
│   ├── api/                      # Backend API routes
│   │   ├── payment/              # Payment webhooks
│   │   ├── orders/               # Order processing
│   │   ├── cron/                 # Scheduled jobs
│   │   └── ...
│   ├── checkout/                 # Checkout flow
│   ├── games/                    # Game catalog
│   └── ...
├── components/                   # React components
├── lib/                          # Utility libraries
│   ├── payment.ts                # Payment processing
│   ├── auth.ts                   # Authentication
│   ├── encryption.ts             # AES-256-GCM encryption
│   └── ...
├── prisma/                       # Database schema
└── public/                       # Static assets
```

---

## 💳 Payment Integration

### Bakong KHQR (Primary)

Accept payments from all Cambodian banking apps:
- ABA Mobile
- ACLEDA Pay
- Wing
- TrueMoney
- Chip Mong Pay
- Prince Bank
- And all KHQR-enabled apps

### ABA PayWay (Optional)

Additional payment method for ABA bank customers.

---

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `NEXTAUTH_SECRET` | ✅ | NextAuth secret (min 32 chars) |
| `ENCRYPTION_KEY` | ✅ | AES-256-GCM encryption key |
| `BAKONG_TOKEN` | ✅ | Bakong API JWT token |
| `BAKONG_ACCOUNT` | ✅ | Bakong merchant account |
| `BAKONG_WEBHOOK_SECRET` | ✅ | Webhook HMAC secret |
| `NEXT_PUBLIC_BASE_URL` | ✅ | Your app URL |
| `ABA_MERCHANT_ID` | ⬜ | ABA PayWay merchant ID |
| `ABA_API_KEY` | ⬜ | ABA PayWay API key |
| `GOOGLE_CLIENT_ID` | ⬜ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ⬜ | Google OAuth client secret |
| `TELEGRAM_BOT_TOKEN` | ⬜ | Telegram bot token |
| `UPSTASH_REDIS_REST_URL` | ⬜ | Upstash Redis URL |

Generate secrets with:
```bash
openssl rand -hex 32
```

---

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

```bash
# Or use Vercel CLI
npx vercel --prod
```

### Other Platforms

Works on any Node.js hosting:
- Railway
- DigitalOcean App Platform
- AWS Amplify
- Self-hosted with Docker

---

## 🔒 Security Features

- ✅ Environment variables for all secrets
- ✅ HMAC-SHA256 webhook verification
- ✅ CSRF protection on state-changing requests
- ✅ Rate limiting on API endpoints
- ✅ SQL injection prevention via Prisma
- ✅ XSS protection via React
- ✅ AES-256-GCM field encryption
- ✅ IP allowlisting for webhooks

---

## 📄 License

MIT License - feel free to use for personal or commercial projects.

---

## 🙏 Support

If you find this project helpful, please give it a ⭐ on GitHub!

**[Live Demo](https://tykhai.vercel.app)** · [Report Bug](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues) · [Request Feature](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues)
