# Game Top-Up Storefront for Cambodia

A full-stack web application for selling game credits (Free Fire Diamonds, PUBG UC, etc.) via KHQR payments. Built with Next.js 16, PostgreSQL, and Prisma ORM.

## Features

- **Multiple Payment Methods**: Bakong KHQR, KHPay, ABA PayWay
- **Game Providers**: GameDrop, G2Bulk integration
- **Admin Panel**: Full management dashboard with orders, products, analytics
- **User System**: Registration, login, Google OAuth, VIP ranks
- **Real-time Features**: Live delivery feed, instant notifications
- **Security**: CSRF protection, rate limiting, webhook verification, encryption
- **Mobile-First**: Responsive design with PWA support

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 18, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (SQLite for development)
- **Auth**: NextAuth.js, JWT (jose), bcryptjs
- **Payments**: Bakong KHQR, KHPay, ABA PayWay
- **Queue**: BullMQ, Redis (Upstash)
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL database (or SQLite for development)
- Redis (optional, for rate limiting)

### 1. Clone & Install

```bash
git clone https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia.git
cd Game-top-up-storefront-for-Cambodia
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration. See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed instructions.

### 3. Setup Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (creates admin user)
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Default Admin Credentials

After seeding, login to admin panel at `/admin/login`:

- **Email**: admin@example.com
- **Password**: ChangeMeNow123!

**Important**: Change these credentials immediately after first login!

## Project Structure

```
tykhai-topup/
├── app/                    # Next.js App Router pages & API routes
│   ├── admin/              # Admin panel
│   ├── api/                # API routes
│   ├── checkout/           # Checkout flow
│   ├── games/              # Game catalog
│   └── ...
├── components/             # React components
├── lib/                    # Utility libraries & services
├── prisma/                 # Database schema & migrations
├── public/                 # Static assets
└── tests/                  # Test files
```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Random hex string |
| `NEXTAUTH_SECRET` | NextAuth secret (min 32 chars) | Random hex string |
| `ENCRYPTION_KEY` | AES-256-GCM key (min 32 chars) | Random hex string |
| `BAKONG_TOKEN` | Bakong API JWT token | Get from Bakong portal |
| `BAKONG_WEBHOOK_SECRET` | Bakong webhook HMAC secret | Random hex string |

### Optional Integrations

- **Google OAuth**: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- **Redis**: Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- **Telegram**: Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- **ABA PayWay**: Set `ABA_MERCHANT_ID` and `ABA_API_KEY`
- **KHPay**: Set `KHPAY_API_KEY`

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed deployment instructions.

### Other Platforms

The app can be deployed to any Node.js hosting platform. See the deployment section in [SETUP_GUIDE.md](./SETUP_GUIDE.md).

## Documentation

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Complete setup and deployment guide
- [API Documentation](./app/api/) - API route definitions

## Security

- All secrets are stored in environment variables
- Webhook signatures are verified using HMAC-SHA256
- CSRF protection on all state-changing requests
- Rate limiting on API endpoints
- SQL injection prevention via Prisma
- XSS protection via React

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
