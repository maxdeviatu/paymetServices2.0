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
- Test setup file: `src/tests/setup.js`
- Mocks for logger and mailer in `src/tests/__mocks__/`
- Tests organized by layer: controllers, services, middlewares

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
- Asynchronous email processing to prevent transaction blocking
- Rate limiting (30 seconds between emails) to avoid server overload
- Retry logic for failed deliveries (max 3 attempts)
- Multiple email types: LICENSE_EMAIL, WAITLIST_NOTIFICATION, ORDER_CONFIRMATION

### Configuration
- Uses pseudoMailer for development/testing
- Configurable intervals and retry limits
- Queue size limit (1000 emails max)

## Job Scheduler

### Automated Processing
- **Scheduler** (`src/jobs/scheduler.js`) - Simple interval-based job system
- **Order Timeout** (`src/jobs/orderTimeout.js`) - Handles order expiration
- **Waitlist Processing** (`src/jobs/waitlistProcessing.js`) - Processes waitlist queue
- Environment-controlled job execution
- Graceful shutdown handling

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
- Webhook signature verification