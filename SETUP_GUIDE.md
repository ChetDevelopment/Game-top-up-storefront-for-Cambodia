# Setup Guide

Complete guide for setting up and deploying the Game Top-Up Storefront.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Payment Integration](#payment-integration)
6. [Deployment](#deployment)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** >= 20.x
- **npm** or **yarn** or **pnpm**
- **PostgreSQL** >= 14 (or SQLite for development)

### Optional Software

- **Redis** - For rate limiting and job queues
- **Git** - For version control

### Required Accounts

- [Bakong Portal](https://api-bakong.nbc.gov.kh) - For KHQR payments
- [Vercel](https://vercel.com) - For deployment (recommended)
- [Neon](https://neon.tech) or [Supabase](https://supabase.com) - For PostgreSQL hosting

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/ChetDevelopment/Game-top-up-storefront-for-Cambodia.git
cd Game-top-up-storefront-for-Cambodia
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and configure the required variables. See [Environment Variables](#environment-variables) section below.

### 4. Setup Database

#### Option A: PostgreSQL (Recommended for Production)

1. Create a PostgreSQL database (local or cloud)
2. Update `DATABASE_URL` in `.env`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name?schema=public"
```

3. Run migrations:

```bash
npx prisma migrate dev
```

#### Option B: SQLite (Quick Development)

1. Update `DATABASE_URL` in `.env`:

```env
DATABASE_URL="file:./dev.db"
```

2. Run migrations:

```bash
npx prisma migrate dev
```

### 5. Seed Database

```bash
npx prisma db seed
```

This creates:
- Default admin user
- Default site settings
- Sample game categories

### 6. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 7. Access Admin Panel

Navigate to [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

**Default credentials:**
- Email: `admin@example.com`
- Password: `ChangeMeNow123!`

**Important**: Change these credentials immediately!

---

## Environment Variables

### Required Variables

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | From your database provider |
| `JWT_SECRET` | JWT signing secret | `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | NextAuth secret | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | AES-256-GCM encryption key | `openssl rand -hex 32` |
| `BAKONG_TOKEN` | Bakong API JWT token | From [Bakong Portal](https://api-bakong.nbc.gov.kh) |
| `BAKONG_WEBHOOK_SECRET` | Webhook HMAC secret | `openssl rand -hex 32` |
| `BAKONG_ACCOUNT` | Bakong merchant account | Your registered email |
| `BAKONG_MERCHANT_NAME` | Store display name | Your store name |
| `NEXT_PUBLIC_BASE_URL` | Your app URL | `http://localhost:3000` for dev |

### Generating Secrets

Use these commands to generate secure random values:

```bash
# Generate JWT secret
openssl rand -hex 32

# Generate encryption key
openssl rand -hex 32

# Generate webhook secret
openssl rand -hex 32
```

Or use an online generator like [random.org](https://www.random.org/) or [allkeysgenerator.com](https://www.allkeysgenerator.com/).

---

## Database Setup

### Initial Migration

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed
```

### Database Schema

The schema includes:
- **Users** - Customer accounts with VIP ranks
- **Admins** - Admin accounts with roles
- **Games** - Game catalog with categories
- **Products** - In-game items with pricing
- **Orders** - Customer orders with payment tracking
- **Payments** - Payment logs and verification
- **Banners** - Homepage banners
- **FAQs** - Frequently asked questions
- **Reviews** - Customer reviews
- **Settings** - Application settings

### Reset Database

To reset and reseed:

```bash
npx prisma migrate reset
npx prisma db seed
```

---

## Payment Integration

### Bakong KHQR (Required)

This is the primary payment method. Customers scan QR codes with Cambodian banking apps.

#### Setup Steps:

1. **Register at Bakong Portal**
   - Visit [https://api-bakong.nbc.gov.kh](https://api-bakong.nbc.gov.kh)
   - Create an account and register your business
   - Get your API token

2. **Configure Environment Variables**

```env
BAKONG_API_BASE="https://api-bakong.nbc.gov.kh"
BAKONG_ACCOUNT="your_registered_email@example.com"
BAKONG_MERCHANT_NAME="Your Store Name"
BAKONG_MERCHANT_CITY="Phnom Penh"
BAKONG_TOKEN="your_jwt_token_from_bakong"
BAKONG_WEBHOOK_SECRET="generate_with_openssl_rand_hex_32"
```

3. **Setup Webhook**
   - Set webhook URL in Bakong portal to: `https://your-domain.com/api/payment/webhook/bakong`
   - Copy the webhook secret to `BAKONG_WEBHOOK_SECRET`

### ABA PayWay (Optional)

For ABA bank payments.

```env
ABA_API_BASE="https://pay.payway.com.kh"
ABA_MERCHANT_ID="your_merchant_id"
ABA_API_KEY="your_api_key"
ABA_WEBHOOK_SECRET="your_webhook_secret"
```

---

## Game Providers

### GameDrop

For game credits delivery.

```env
GAMEDROP_TOKEN="your_gamedrop_api_token"
```

### G2Bulk

For Free Fire and other games.

```env
G2BULK_TOKEN="your_g2bulk_api_token"
```

---

## Deployment

### Vercel (Recommended)

#### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

#### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure environment variables (copy from `.env`)
5. Click "Deploy"

#### 3. Configure Custom Domain (Optional)

1. Go to Project Settings > Domains
2. Add your custom domain
3. Update DNS records as instructed

#### 4. Setup Cron Jobs

The project includes cron jobs for:
- Processing pending deliveries
- Reconciling payments

These are automatically configured in `vercel.json`.

### Other Platforms

#### Railway

1. Create a new project on [Railway](https://railway.app)
2. Add PostgreSQL service
3. Add Redis service (optional)
4. Configure environment variables
5. Deploy

#### DigitalOcean App Platform

1. Create a new app on DigitalOcean
2. Connect your GitHub repository
3. Add a managed PostgreSQL database
4. Configure environment variables
5. Deploy

#### Self-Hosted (Docker)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

---

## Post-Deployment

### 1. Update Admin Password

1. Login to admin panel
2. Go to Settings > Admin
3. Change the default password

### 2. Configure Site Settings

1. Go to Admin > Settings
2. Update:
   - Site name
   - Exchange rate
   - Contact information
   - Social media links

### 3. Add Games and Products

1. Go to Admin > Games
2. Add game categories
3. Add products for each game

### 4. Setup Payment Methods

1. Configure Bakong KHQR (required)
2. Configure additional payment methods if needed

### 5. Test Payment Flow

1. Place a test order
2. Verify QR code generation
3. Test webhook receiving
4. Verify order status updates

---

## Troubleshooting

### Common Issues

#### Database Connection Error

```
Error: Can't reach database server
```

**Solution:**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check firewall settings

#### JWT Secret Error

```
Error: FATAL: JWT_SECRET environment variable is required
```

**Solution:**
- Ensure `JWT_SECRET` is set in `.env`
- Ensure it's at least 32 characters

#### Bakong Token Error

```
Error: BAKONG_TOKEN environment variable is required
```

**Solution:**
- Get token from Bakong portal
- Add to `.env` file

#### Webhook Not Receiving

**Solution:**
- Verify webhook URL is correct
- Check webhook secret matches
- Ensure your domain is accessible
- Check SSL certificate

### Debug Mode

Enable debug logging:

```env
NODE_ENV=development
```

### Check Environment Variables

```bash
npx prisma studio
```

This opens a database browser where you can check settings.

### Logs

Check Vercel function logs in the Vercel dashboard under "Functions" tab.

---

## Support

For issues and questions:
- Check this documentation
- Open an issue on GitHub
- Review the code in `lib/` directory

---

## Security Notes

1. **Never commit `.env` files** to version control
2. **Use strong secrets** - generate with `openssl rand -hex 32`
3. **Rotate secrets** if compromised
4. **Enable HTTPS** in production
5. **Keep dependencies updated**

---

## License

MIT
