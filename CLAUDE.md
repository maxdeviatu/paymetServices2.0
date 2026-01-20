# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development
- `npm run dev` - Start development server with nodemon (hot reload)
- `npm start` - Start production server
- `npm run create-admin` - Create/verify super administrator

### Testing
- `npm test` - Run all tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- Run specific test: `npm test -- --testPathPattern=<pattern>`

### Code Quality
- `npm run lint` - Check code style with Standard
- `npm run lint:fix` - Fix code style issues automatically

### Database & Setup
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Run database seeders
- `npm run env:validate` - Validate environment configuration
- `npm run webhook:setup` - Create webhook events table
- `npm run create-invoices-table` - Create invoices table

### Payment Provider Testing
- `npm run cobre:subscribe` - Bootstrap Cobre subscription setup
- `npm run cobre:test` - Test Cobre connection
- `npm run webhook:test` - Test webhook with mock data
- `npm run webhook:test-cobre` - Test Cobre webhook processing

## Architecture Overview

Node.js REST API for payment services built with Express, Sequelize (PostgreSQL), and JWT authentication.

### Core Architecture Pattern
```
Routes → Controllers → Services → Models
           ↓
      Middlewares (auth, validation, roles)
```
- **Routes** (`src/routes/`) - HTTP endpoint definitions
- **Controllers** (`src/controllers/`) - HTTP request/response handling
- **Services** (`src/services/`) - Business logic layer
- **Models** (`src/models/`) - Sequelize ORM data access
- **Middlewares** (`src/middlewares/`) - Auth, validation, roles, rate limiting

### Authentication & Authorization
- JWT-based authentication for admin users
- Role hierarchy: `READ_ONLY` → `EDITOR` → `SUPER_ADMIN`
- Auth middleware: `src/middlewares/auth.js`
- Role middleware: `src/middlewares/role.js`

### Key Business Entities
- **Products** - Catalog items with pricing and discounts
- **Licenses** - Digital license inventory (states: AVAILABLE, RESERVED, SOLD, ANNULLED, RETURNED)
- **Orders** - Purchase orders (states: PENDING, IN_PROCESS, COMPLETED, CANCELED, SHIPPED, DELIVERED)
- **Transactions** - Payment gateway interactions
- **WaitlistEntries** - Queue for out-of-stock digital products
- **Invoices** - Billing records linked to transactions

## Payment System

### Payment Providers (`src/services/payment/providers/`)
- **Cobre** - Primary Colombian gateway (PSE, Bancolombia, Nequi) with OAuth2 and webhook integration
- **ePayco** - Alternative gateway with checkout page integration
- **Mock** - Testing provider

### Transaction Flow
1. Order creation → 2. Payment intent via provider → 3. Webhook status updates → 4. License reservation → 5. Email notifications

### Webhook System (`src/services/webhook/`)
- Multi-provider webhook processing with signature verification (HMAC-SHA256)
- Idempotency via `webhook_events` table
- Provider adapters: Cobre, ePayco, Mock

## Background Jobs (`src/jobs/`)

- **scheduler.js** - Interval-based job system with graceful shutdown
- **orderTimeout.js** - Cancels expired orders (every 10 minutes)
- **waitlistProcessing.js** - Auto-reserves licenses (every 30 seconds)
- **invoiceProcessing.js** - Generates Siigo invoices (hourly)

Environment controls: `ENABLE_WAITLIST_PROCESSING`, `ENABLE_INVOICE_PROCESSING`

## Email System

### Architecture
- Asynchronous queue processing via `src/services/emailQueue.service.js`
- Rate limiting: 30-second intervals between emails
- Retry logic: Up to 3 attempts with exponential backoff
- Types: LICENSE_EMAIL, WAITLIST_NOTIFICATION, TEST_EMAIL

### Providers (`src/services/email/`)
- **Brevo** (Production) - Transactional email API
- **PseudoMailer** (Development) - Mock for testing

## Invoicing System (`src/services/invoices/`)

### Providers
- **Siigo** - Colombian invoicing with DIAN integration and OAuth2
- **Mock** - Development/testing

### Invoice Processing
Hourly job processes PAID transactions without invoices, creates invoices in Siigo, and updates transaction records.

## Logging System

Winston with custom methods:
```javascript
logger.logBusiness('operationName', { data })  // Business operations
logger.logError(error, { context })            // Errors with context
logger.logDB('queryName', { details })         // Database operations
```
Log files: `logs/error.log`, `logs/combined.log`

## Testing Setup

- Jest with Supertest for API testing
- Test setup: `src/tests/setup.js` (mocks console, sets 10s timeout)
- Mocks in `src/tests/__mocks__/` (logger, mailer)
- Tests organized in `src/tests/unit/` by layer: controllers, services, middlewares, utils

## Database

- PostgreSQL with Sequelize ORM
- Connection config: `src/config/index.js`
- Schema management: `SCHEMA_ALTER=1` enables auto-sync in development
- Transaction isolation: SERIALIZABLE for inventory, SELECT FOR UPDATE for critical operations

## Key Utilities

- **TransactionManager** (`src/utils/transactionManager.js`) - Database transaction handling with isolation levels
- **AuthenticationManager** (`src/utils/authenticationManager.js`) - Provider authentication management

## Docker Support

- `docker-compose.yml` for local development
- `docker/local.Dockerfile` with volume mounts for hot reload
