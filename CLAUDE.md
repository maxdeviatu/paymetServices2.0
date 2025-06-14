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
- **Admins** - Administrative users with role-based permissions
- **Users** - Regular users with OTP-based authentication

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