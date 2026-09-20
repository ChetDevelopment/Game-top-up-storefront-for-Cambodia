<div align="center">

<img src="public/icon-512x512.png" alt="Logo" width="120" style="border-radius: 24px;"/>

# 🎮 Game Top-Up Storefront

### *The complete e-commerce platform for selling game credits in Cambodia*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&style=for-the-badge)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&style=for-the-badge)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

<br/>

**[Live Demo](https://tykhai.vercel.app)** · [Report Bug](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues) · [Request Feature](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues)

</div>

---

## 📸 Features Overview

<table>
<tr>
<td width="50%">

### 🛒 **Customer Features**
- Browse game catalog with categories
- Search & filter games/products
- Secure checkout with QR payment
- Real-time order tracking
- User registration & login
- Google OAuth support
- Wallet system
- Referral program
- Daily missions & rewards
- Spin wheel & mystery boxes

</td>
<td width="50%">

### 👨‍💼 **Admin Features**
- Dashboard with analytics
- Order management system
- Product & game management
- Customer management
- Payment health monitoring
- Banner management
- Blog/CMS system
- Promo code system
- Reseller management
- Settings & configuration

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Next.js    │  │    React    │  │      Tailwind CSS       │ │
│  │  App Router  │  │  Components │  │    Responsive Design    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                         API LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  API Routes  │  │   Auth &    │  │     Rate Limiting       │ │
│  │  (REST)     │  │  Security   │  │     & CSRF Protection   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Prisma     │  │ PostgreSQL  │  │       Redis             │ │
│  │    ORM       │  │  Database   │  │   (Upstash/Optional)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                      PAYMENT LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Bakong KHQR  │  │  ABA PayWay │  │   Webhook Verification  │ │
│  │  (Primary)   │  │  (Optional) │  │     HMAC-SHA256         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | >= 20.x | Runtime |
| PostgreSQL | >= 14 | Database |
| Redis | Optional | Caching & queues |

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia.git
cd Game-top-up-storefront-for-Cambodia

# Install dependencies
npm install
```

### 2. Configuration

```bash
# Create environment file
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/your_db"

# Security (generate with: openssl rand -hex 32)
JWT_SECRET="your_32_character_secret_here"
NEXTAUTH_SECRET="your_32_character_secret_here"
ENCRYPTION_KEY="your_32_character_secret_here"

# Payment (Bakong KHQR)
BAKONG_API_BASE="https://api-bakong.nbc.gov.kh"
BAKONG_ACCOUNT="your_email@example.com"
BAKONG_MERCHANT_NAME="Your Store Name"
BAKONG_TOKEN="your_bakong_token"
BAKONG_WEBHOOK_SECRET="your_webhook_secret"

# App URL
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed
```

### 4. Start Development

```bash
npm run dev
```

Visit **http://localhost:3000** 🎉

---

## 🔐 Admin Access

| Item | Value |
|------|-------|
| **URL** | `http://localhost:3000/admin/login` |
| **Email** | `admin@example.com` |
| **Password** | `ChangeMeNow123!` |

> ⚠️ **Important:** Change these credentials immediately after first login!

---

## 📁 Project Structure

```
├── app/                          # Next.js App Router
│   ├── admin/                    # Admin panel (25+ pages)
│   │   ├── orders/               # Order management
│   │   ├── products/             # Product catalog
│   │   ├── games/                # Game management
│   │   ├── customers/            # Customer list
│   │   ├── settings/             # Site settings
│   │   └── ...
│   ├── api/                      # Backend API routes
│   │   ├── payment/webhook/      # Payment webhooks
│   │   ├── orders/               # Order processing
│   │   ├── cron/                 # Scheduled jobs
│   │   └── ...
│   ├── checkout/                 # Checkout flow
│   ├── games/                    # Game catalog
│   ├── account/                  # User account
│   └── ...
├── components/                   # Reusable React components
├── lib/                          # Utility libraries
│   ├── payment.ts                # Payment processing
│   ├── auth.ts                   # Authentication
│   ├── encryption.ts             # AES-256-GCM encryption
│   ├── gamedrop.ts               # GameDrop integration
│   ├── g2bulk.ts                 # G2Bulk integration
│   └── ...
├── prisma/                       # Database schema & migrations
│   └── schema.prisma             # 30+ models
└── public/                       # Static assets
```

---

## 💳 Payment Integration

### Supported Methods

| Method | Status | Description |
|--------|--------|-------------|
| **Bakong KHQR** | ✅ Active | All Cambodian banking apps |
| **ABA PayWay** | ✅ Active | ABA bank customers |
| **Wallet** | ✅ Active | Built-in wallet system |

### How KHQR Works

```
Customer → Scans QR → Banking App → Bakong → Webhook → Order Fulfillment
```

1. Customer selects product and enters game UID
2. System generates unique KHQR code
3. Customer scans with any Cambodian banking app
4. Payment confirmed via Bakong webhook
5. Auto-delivery to game account

---

## 🔧 Environment Variables

### Required

| Variable | Description | Generate |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection | From database provider |
| `JWT_SECRET` | JWT signing secret | `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | NextAuth secret | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256-GCM key | `openssl rand -hex 32` |
| `BAKONG_TOKEN` | Bakong API token | [Bakong Portal](https://api-bakong.nbc.gov.kh) |
| `BAKONG_ACCOUNT` | Merchant account | Your registered email |
| `BAKONG_WEBHOOK_SECRET` | Webhook HMAC secret | `openssl rand -hex 32` |
| `NEXT_PUBLIC_BASE_URL` | Your app URL | e.g., `https://yourdomain.com` |

### Optional

| Variable | Description |
|----------|-------------|
| `ABA_MERCHANT_ID` | ABA PayWay merchant ID |
| `ABA_API_KEY` | ABA PayWay API key |
| `GAMEDROP_TOKEN` | GameDrop API token |
| `G2BULK_TOKEN` | G2Bulk API token |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |

See [`.env.example`](.env.example) for the complete list.

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or import from GitHub:
1. Push to GitHub
2. Import in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

### Docker

```bash
docker build -t game-topup .
docker run -p 3000:3000 game-topup
```

### Other Platforms

- Railway
- DigitalOcean App Platform
- AWS Amplify
- Any Node.js hosting

---

## 🔒 Security

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

MIT License - Free for personal and commercial use.

---

<div align="center">

**[Live Demo](https://tykhai.vercel.app)** · [Report Bug](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues) · [Request Feature](https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia/issues)

Made with ❤️ for the Cambodian gaming community

</div>
