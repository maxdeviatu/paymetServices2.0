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

### Code Quality
- `npm run lint` - Check code style with Standard
- `npm run lint:fix` - Fix code style issues automatically

### Database
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Run database seeders

### Additional Development Commands
- `npm run env:validate` - Validate environment configuration
- `npm run webhook:setup` - Create webhook events table
- `npm run create-invoices-table` - Create invoices table for billing system
- `npm run cobre:subscribe` - Bootstrap Cobre subscription setup
- `npm run cobre:test` - Test Cobre connection
- `npm run webhook:test` - Test webhook with mock data
- `npm run webhook:test-cobre` - Test Cobre webhook processing

## Architecture Overview

This is a Node.js REST API for payment services built with Express, Sequelize (PostgreSQL), and JWT authentication.

### Core Architecture Pattern
The application follows a layered architecture:
- **Routes** (`src/routes/`) - HTTP endpoint definitions
- **Controllers** (`src/controllers/`) - HTTP request/response handling
- **Services** (`src/services/`) - Business logic layer
- **Models** (`src/models/`) - Data access layer with Sequelize ORM
- **Middlewares** (`src/middlewares/`) - Cross-cutting concerns (auth, validation, roles)

### Authentication & Authorization
- JWT-based authentication for admin users
- Role-based access control with hierarchy:
  - `READ_ONLY` - View operations only
  - `EDITOR` - Create and edit operations
  - `SUPER_ADMIN` - Full access including delete operations
- Authentication middleware: `src/middlewares/auth.js`
- Role verification middleware: `src/middlewares/role.js`

### Key Business Entities
- **Products** - Core catalog items with pricing, discounts, and references
- **Discounts** - Time-based discount system that can be linked to products
- **Licenses** - Digital license inventory linked to products with states (AVAILABLE, RESERVED, SOLD, ANNULLED, RETURNED)
- **Orders** - Purchase orders with lifecycle states (PENDING, IN_PROCESS, COMPLETED, CANCELED, SHIPPED, DELIVERED)
- **Transactions** - Payment gateway interactions tracking payment status
- **Users** - Regular users with OTP-based authentication
- **Admins** - Administrative users with role-based permissions
- **WaitlistEntries** - Queue system for handling out-of-stock digital products

### Database Architecture
- PostgreSQL with Sequelize ORM
- Models define relationships (Products ↔ Discounts, etc.)
- Database initialization and super admin creation happens on startup
- Connection configuration in `src/config/index.js`

### Logging System
The project uses Winston with custom logging methods:
- `logger.logBusiness(operation, data)` - Business operation logging
- `logger.logError(error, context)` - Error logging with context
- `logger.logDB(queryName, details)` - Database operation logging
- Different formats for development (colored, verbose) vs production (JSON)
- Log files: `logs/error.log`, `logs/combined.log`

### Environment Configuration
- Configuration centralized in `src/config/index.js`
- Uses dotenv for environment variables
- Database, JWT, and server settings configurable via environment
- Auto-creates super admin on startup if none exists

### Testing Setup
- Jest with Supertest for API testing
- Test setup file: `src/tests/setup.js` (includes global mocks and 10s timeout)
- Mocks for logger and mailer in `src/tests/__mocks__/`
- Tests organized by layer: controllers, services, middlewares, utils
- Run specific test: `npm test -- --testPathPattern=<pattern>`
- Run tests with file watch: `npm run test:watch`

### Scripts
- `src/scripts/createSuperAdmin.js` - Creates initial super admin user
- `src/scripts/cleanupOtps.js` - Cleanup expired OTP tokens

### Docker Support
- Local development with `docker-compose.yml`
- Dockerfile in `docker/local.Dockerfile`
- Volume mounts for hot reload in development

## Licenses Module

The licenses module manages digital license inventory for products with full CRUD operations and CSV bulk import/export capabilities.

### Key Features
- **Digital License Inventory**: Track license keys linked to products via `productRef`
- **State Management**: Five states - AVAILABLE, RESERVED, SOLD, ANNULLED, RETURNED
- **CSV Operations**: Template download and bulk upload with duplicate handling
- **Transactional Operations**: Uses SELECT FOR UPDATE for concurrency control
- **Role-based Access**: Different permissions for READ_ONLY, EDITOR, and SUPER_ADMIN

### API Endpoints
- `GET /api/licenses/template` - Download CSV template (EDITOR+)
- `POST /api/licenses/upload` - Bulk import from CSV (EDITOR+)
- `GET /api/licenses` - List all licenses with filters (READ_ONLY+)
- `GET /api/licenses/:id` - Get license by ID (READ_ONLY+)
- `POST /api/licenses` - Create new license (EDITOR+)
- `PUT /api/licenses/:id` - Update license (EDITOR+)
- `DELETE /api/licenses/:id` - Soft delete license (SUPER_ADMIN)
- `POST /api/licenses/:code/annul` - Annul license by key (SUPER_ADMIN)
- `POST /api/licenses/:code/return` - Return license to stock (SUPER_ADMIN)

### Business Rules
- SOLD licenses cannot have their `licenseKey` modified
- Only SOLD licenses can be returned to stock
- Annulled licenses get `ANULADA-{last5}` format for license key
- CSV import ignores duplicates for repeatable imports
- All operations are logged with business context

### Database Table
- Table name: `product_inventory`
- Key fields: `productRef` (FK), `licenseKey` (unique), `status`, `orderId`, `reservedAt`, `soldAt`
- Associations: belongs to Product via `productRef`

## Payment System Architecture

### Payment Providers
- **Cobre** - Primary Colombian payment gateway (PSE, Bancolombia, Nequi)
  - OAuth2 authentication with token refresh
  - 24-hour checkout expiration
  - Full webhook integration with HMAC-SHA256 signature verification
- **ePayco** - Alternative Colombian payment gateway
  - Checkout page integration with public/private key authentication
  - Configurable test/production mode
  - Webhook confirmation URL support
- **Mock** - Testing provider for development

### Transaction Flow
1. Order creation with customer auto-creation/lookup
2. Payment intent creation via provider
3. Webhook-driven status updates
4. License reservation for digital products
5. Email notifications and waitlist handling

### Key Components
- **TransactionManager** (`src/utils/transactionManager.js`) - Database transaction handling
- **AuthenticationManager** (`src/utils/authenticationManager.js`) - Provider authentication
- **Payment Services** (`src/services/payment/`) - Provider-specific implementations

## Webhook System

### Unified Webhook Hub
- Multi-provider webhook processing platform
- Provider adapters for Cobre and Mock
- Signature verification and idempotency handling
- Complete audit trail in `webhook_events` table

### Key Features
- **Idempotency**: Prevents duplicate processing using database constraints
- **Security**: HMAC-SHA256 verification, rate limiting, input sanitization
- **Event Handling**: Transaction status updates, license management, email triggers
- **Administration**: Statistics API, event listing, health checks

### API Endpoints
- `POST /webhooks/:provider` - Receive webhook events
- `GET /api/webhooks/stats` - Processing statistics
- `GET /api/webhooks/events` - Event history

## Waitlist System

### Queue Management
- FIFO processing for out-of-stock digital products
- Automatic license reservation when stock becomes available
- Job-based processing every 30 seconds
- Email queue for customer notifications

### States & Flow
```
Order (PAID) → No Stock → Waitlist Entry (PENDING)
                             ↓
Stock Added → License Reserved → Processing Job → License SOLD → Email Queue
```

### Components
- **WaitlistService** (`src/services/waitlist.service.js`) - Core business logic
- **Processing Job** (`src/jobs/waitlistProcessing.js`) - Automated processing
- **Email Queue** (`src/services/emailQueue.service.js`) - Rate-limited notifications

### API Endpoints
- `GET /api/waitlist/metrics` - Queue statistics (READ_ONLY+)
- `GET /api/waitlist` - List entries with filters (READ_ONLY+)
- `POST /api/waitlist/reserve` - Manual license reservation (EDITOR+)
- `POST /api/waitlist/process` - Manual processing trigger (EDITOR+)

## Email System

### Email Queue Architecture
- **Asynchronous Processing**: Prevents transaction blocking by queuing emails for background processing
- **Rate Limiting**: 30-second intervals between emails to avoid provider limits
- **Retry Logic**: Up to 3 attempts for failed deliveries with exponential backoff
- **Multiple Types**: LICENSE_EMAIL, WAITLIST_NOTIFICATION, TEST_EMAIL
- **Queue Management**: FIFO processing with status tracking (PENDING, RETRYING)

### Email Providers
- **Brevo (Production)**: Transactional email service with API integration
- **PseudoMailer (Development)**: Mock service for testing without external calls
- **Template Engine**: Handlebars-based HTML templates with variable substitution

### Configuration Variables
- `SEND_EMAILS=true/false` - Global email sending toggle
- `BREVO_API_KEY` - Brevo service authentication
- `BREVO_SENDER_EMAIL` - Default sender address
- `WAITLIST_EMAIL_INTERVAL_SECONDS=30` - Processing interval
- `WAITLIST_EMAIL_MAX_RETRIES=3` - Maximum retry attempts
- `WAITLIST_EMAIL_QUEUE_MAX_SIZE=1000` - Queue capacity limit

### API Endpoints
- `GET /api/email-queue/stats` - Queue statistics and processing status
- `POST /api/email-queue/process` - Manual queue processing trigger
- `POST /api/email-queue/test` - Add test email to queue for verification
- `POST /api/email-queue/clear` - Clear queue (maintenance only)
- `GET /api/email-queue/metrics` - Combined waitlist and email metrics

## Job Scheduler

### Automated Processing
- **Scheduler** (`src/jobs/scheduler.js`) - Interval-based job system with graceful shutdown
- **Order Timeout** (`src/jobs/orderTimeout.js`) - Cancels expired orders (every 10 minutes)
- **Waitlist Processing** (`src/jobs/waitlistProcessing.js`) - Auto-reserves licenses and processes queue (every 30 seconds)
- **Invoice Processing** (`src/jobs/invoiceProcessing.js`) - Generates Siigo invoices for paid transactions (hourly)

### Environment Controls
- `ENABLE_WAITLIST_PROCESSING=true/false` - Controls waitlist job execution
- `ENABLE_INVOICE_PROCESSING=true/false` - Controls invoice generation
- Jobs are disabled in test environment automatically

### Job Management API
- `GET /api/admin/jobs/status` - Status of all registered jobs
- `POST /api/admin/jobs/:jobName/start` - Start specific job manually
- `POST /api/admin/jobs/:jobName/stop` - Stop specific job
- `POST /api/admin/jobs/invoice/run` - Execute invoice processing manually

## Security & Rate Limiting

### Middleware Stack
- **Security** (`src/middlewares/security.js`) - Helmet.js, input sanitization
- **Rate Limiter** (`src/middlewares/rateLimiter.js`) - Endpoint-specific limits
- **Authentication** (`src/middlewares/auth.js`) - JWT verification
- **Role-based Access** (`src/middlewares/role.js`) - Permission hierarchy

### Protection Features
- Rate limiting on payment and order endpoints
- CSRF protection for admin operations
- Input sanitization across all public endpoints
- Webhook signature verification with HMAC-SHA256

## Application Startup Sequence

### Critical Initialization Order
1. **Environment Validation** - Validates 50+ required variables across 7 categories
2. **Database Connection** - PostgreSQL with connection pooling (5-20 connections)
3. **Model Synchronization** - Auto-sync in development, manual migrations in production
4. **Super Admin Creation** - Ensures administrative access exists
5. **Payment Provider Authentication** - Concurrent OAuth2 initialization for Cobre
6. **External Service Connections** - Siigo invoicing and webhook subscriptions
7. **Job Scheduler Startup** - Background processing for orders, waitlist, and invoices
8. **Email Queue Initialization** - Asynchronous email processing service

### Environment Variables for Startup
**Required for basic operation:**
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `JWT_SECRET` (minimum 32 characters)
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`

**Required for payment processing (Cobre):**
- `COBRE_USER_ID`, `COBRE_SECRET`, `COBRE_BASE_URL`
- `COBRE_WEBHOOK_URL`, `COBRE_WEBHOOK_SECRET`

**Required for payment processing (ePayco):**
- `EPAYCO_PUBLIC_KEY`, `EPAYCO_PRIVATE_KEY`, `EPAYCO_P_KEY`
- `EPAYCO_P_CUST_ID_CLIENTE`, `EPAYCO_RESPONSE_URL`, `EPAYCO_CONFIRMATION_URL`
- `EPAYCO_TEST=true/false` - Test mode toggle

**Required for invoicing:**
- `SIIGO_API_URL`, `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_PARTNER_ID`
- `SIIGO_SALES_DOCUMENT_ID`, `SIIGO_SELLER_ID`, `SIIGO_PAYMENT_TYPE_ID`

### Schema Management
- `SCHEMA_ALTER=1` - Enables automatic schema updates in development
- Production environments require manual migrations for safety
- Database initialization includes indexes and constraints optimization

## Transaction Management

### Database Transactions
- **TransactionManager** (`src/utils/transactionManager.js`) provides isolation levels
- **SERIALIZABLE** isolation for inventory operations to prevent race conditions
- **SELECT FOR UPDATE** locking for critical license and waitlist operations
- Automatic rollback on errors with comprehensive logging

### Concurrency Handling
- License reservation uses database-level locking
- Waitlist processing handles concurrent order processing
- Authentication tokens managed thread-safely across requests