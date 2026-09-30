# We Three — Comprehensive Family Management App

A full-featured family management application combining task management, financial tracking, contacts, events, and AI-powered assistance. Built with modern technologies including Node.js/Express backend, React Native mobile frontend, TypeScript throughout, and MongoDB for data persistence.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Mobile App Setup](#mobile-app-setup)
  - [Local Server Setup](#local-server-setup)
- [Running the Application](#running-the-application)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Production Hardening](#production-hardening)
- [Offline Support](#offline-support)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

"We Three" is a comprehensive family management platform that helps families:
- **Stay organized**: Manage shared tasks, reminders, and events
- **Track finances**: Monitor accounts, transactions, and group expenses
- **Stay connected**: Maintain shared contacts and emergency information
- **Plan together**: Set family goals, manage shopping lists, and track family events
- **Get AI assistance**: Leverage Gemini integration for smart recommendations and voice commands
- **Reduce friction**: Intuitive mobile app with offline support and real-time sync

The application consists of three components:
1. **Backend API** (Node.js/Express) - REST API with MongoDB persistence
2. **Mobile App** (React Native/Expo) - Cross-platform iOS and Android
3. **Local Server** (Node.js) - Optional local AI processing (OCR and voice)

## Features

### Core Features

#### Task & Reminder Management
- Create, edit, delete, and complete tasks
- Set reminders with customizable notification times
- Task calendar view with month overview and task details
- Priority levels and task categorization
- Recurring task support (via recurring payments system)

#### Financial Management
- Multiple account support with custom account names
- Track cash-in and cash-out transactions
- Financial insights with charts:
  - 6-month cash-flow trend line
  - Category-wise spending breakdown
  - Account-wise spending comparison
- Transaction history with filtering and search
- Account balance calculations (cash-in minus cash-out)

#### Group Expenses
- Create expense groups with multiple members
- Log shared expenses
- Automatic settlement calculations
- Settlement payment tracking

#### Contact Management
- Shared family contacts with phone numbers
- Import contacts from device
- Emergency contact information
- Emergency info with details like blood type, medical conditions

#### Family Events
- Create and manage family events
- Event scheduling with dates and times
- Weekly summary of upcoming events

#### Notes & Documentation
- Create and organize notes
- Rich text support
- Quick note access

#### Shopping & Inventory
- Shared shopping lists
- Check-off items as purchased
- Inventory management for household items
- Track quantity and status

#### Vehicles (Automotive Management)
- Track vehicle details and information
- Manage vehicle documents (registration, insurance, etc.)
- Document expiry tracking

#### Additional Features
- **Polls**: Create family polls and voting
- **Lead Management**: Track and manage leads (CRM-like functionality)
- **Vault Documents**: Secure document storage
- **Location Sharing**: Share real-time location with family
- **Notifications Center**: Consolidated notification management
- **Sync Center**: Monitor offline/online sync status
- **Admin Features**: User management and feature flags

### AI & Voice Integration

- **Gemini Integration**: Backend-controlled tool-calling for safety (never exposes API key to mobile)
- **Voice Input**: Microphone input with speech recognition (requires native build)
- **Voice Output**: Text-to-speech for assistant responses
- **Financial Confirmations**: Requires explicit user confirmation for money-related actions
- **Text Chat**: Conversational interface with Gemini

### Offline Support

- **Offline Queue**: Creates, tasks, and transactions queued locally when offline
- **Idempotent Sync**: Same idempotency key prevents duplicates on flaky connections
- **Dashboard Cache**: Home screen shows cached data with sync status banner
- **Automatic Sync**: Syncs automatically on app start and when going online

## Tech Stack

### Backend

- **Runtime**: Node.js (v20+)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Rate Limiting**: express-rate-limit
- **Security**: Helmet for HTTP headers
- **Logging**: Morgan for HTTP request logging
- **Validation**: Zod for runtime type validation
- **AI**: Google Generative AI (Gemini)
- **Date/Time**: Luxon for timezone-aware date handling
- **In-Memory DB**: mongodb-memory-server (development)
- **Testing**: Jest + Supertest

### Mobile App

- **Framework**: Expo (React Native SDK)
- **Language**: TypeScript
- **Navigation**: React Navigation (bottom tabs + native stack)
- **UI Components**: React Native + Expo components
- **HTTP Client**: Axios
- **Storage**: AsyncStorage for local persistence
- **Cryptography**: expo-crypto for secure operations
- **File Management**: expo-file-system, expo-document-picker
- **Media**: expo-image-picker, expo-camera (via expo-document-picker)
- **Location**: expo-location for GPS
- **Notifications**: Notifee for local notifications
- **Speech**: expo-speech, expo-speech-recognition
- **Networking**: @react-native-community/netinfo for connectivity
- **Platform-specific**: expo-contacts, react-native-maps, react-native-ble-advertiser
- **Charts**: react-native-svg (custom SVG-based visualizations)
- **Calendar**: react-native-calendars
- **Date/Time**: @react-native-community/datetimepicker

### DevOps & Deployment

- **Docker**: Multi-stage build for production backend
- **Deployment Platform**: Render.com (via render.yaml)
- **Database Hosting**: MongoDB Atlas
- **Mobile Build**: EAS (Expo Application Services)
- **Code Quality**: TypeScript for static type checking

## Project Structure

```
Tasks/
├── backend/                    # Node.js/Express REST API
│   ├── src/
│   │   ├── app.ts             # Express app factory
│   │   ├── server.ts          # Entry point
│   │   ├── config/
│   │   │   ├── db.ts          # MongoDB connection (memory or Atlas)
│   │   │   ├── env.ts         # Environment validation
│   │   │   └── jwt.ts         # JWT configuration
│   │   ├── controllers/       # Route handlers (30+ controllers)
│   │   ├── routes/            # API endpoints (30+ route files)
│   │   ├── models/            # MongoDB schemas (Mongoose)
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # Express middleware
│   │   ├── validators/        # Input validation (Zod schemas)
│   │   └── utils/             # Helper functions
│   ├── tests/                 # Jest test suite (38+ tests)
│   ├── .env.example           # Environment variables template
│   ├── Dockerfile             # Multi-stage production build
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript configuration
│   └── jest.config.js         # Test configuration
│
├── mobile/                     # React Native/Expo mobile app
│   ├── src/
│   │   ├── App.tsx            # Root component
│   │   ├── app.json           # Expo configuration
│   │   ├── screens/           # Feature screens (60+ screens)
│   │   ├── components/        # Reusable UI components
│   │   ├── api/               # API client and hooks
│   │   ├── auth/              # Authentication logic
│   │   ├── navigation/        # Navigation structure
│   │   ├── types/             # TypeScript type definitions
│   │   ├── theme/             # Colors, typography, theming
│   │   ├── utils/             # Helper functions
│   │   ├── offline/           # Offline queue management
│   │   ├── location/          # Location services
│   │   ├── notifications/     # Local notifications
│   │   ├── voice/             # Speech recognition & TTS
│   │   └── features/          # Feature flags
│   ├── .env.example           # Environment variables template
│   ├── eas.json               # EAS build configuration
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript configuration
│   └── app.json               # Expo app manifest
│
├── local-server/              # Optional local AI server
│   ├── server.js              # Node.js server for OCR/voice
│   ├── package.json           # Dependencies
│   └── README.md              # Local server documentation
│
├── render.yaml                # Render deployment blueprint
├── .github/
│   └── workflows/             # GitHub Actions CI/CD
└── README.md                  # Original documentation

```

### API Structure

The backend exposes the following API routes (all prefixed with `/api`):

**Authentication**: `/auth` (register, login, logout, refresh token)
**Users**: `/user` (profile, settings)
**Tasks**: `/tasks` (CRUD + calendar view)
**Reminders**: `/reminders` (get upcoming reminders)
**Finance**: `/finance/accounts`, `/finance/transactions` (account management, transactions)
**Contacts**: `/contacts` (CRUD)
**Events**: `/events` (family events)
**Chat**: `/chat` (message history, threads)
**Assistant**: `/assistant/message` (Gemini integration)
**Group Expenses**: `/group-expenses`, `/group-expenses/groups` (group management)
**Polls**: `/polls` (create, vote)
**Shopping Lists**: `/shopping-lists` (list management)
**Vehicles**: `/vehicles` (vehicle details)
**Notes**: `/notes` (note management)
**Inventory**: `/inventory` (inventory items)
**Goals**: `/family-goals` (family goal tracking)
**Vault**: `/vault-documents` (secure document storage)
**Location**: `/location` (location sharing)
**Leads**: `/leads` (lead management/CRM)
**Admin**: `/admin` (admin operations)
**Search**: `/search` (global search)

## Installation & Setup

### Prerequisites

- **Node.js**: v20.19.4 or higher (or `nvm install --lts`)
- **npm**: Included with Node.js
- **Git**: For version control
- **MongoDB**: Either local instance or MongoDB Atlas account
- **Expo CLI**: For mobile development (`npm install -g expo-cli`)
- **Android Studio** (optional): For Android development
- **Xcode** (optional, macOS only): For iOS development

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file**:
   - Leave `MONGO_URI` empty for local development (uses in-memory MongoDB)
   - Or set `MONGO_URI` to your MongoDB Atlas connection string for persistent data
   - Generate JWT secrets: `openssl rand -hex 32` (run twice for both secrets)
   - Add `GEMINI_API_KEY` from https://aistudio.google.com/apikey (optional, for AI features)

   Example `.env` for local development:
   ```
   PORT=4000
   NODE_ENV=development
   MONGO_URI=
   JWT_ACCESS_SECRET=your-generated-secret-here
   JWT_REFRESH_SECRET=your-generated-secret-here
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=30d
   CORS_ORIGIN=*
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-3.6-flash
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

   The backend will be available at `http://localhost:4000`

6. **Health check**:
   ```bash
   curl http://localhost:4000/health
   ```

### Mobile App Setup

1. **Navigate to mobile directory**:
   ```bash
   cd mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file** to point to your backend:
   ```
   # For iOS simulator
   EXPO_PUBLIC_API_URL=http://localhost:4000/api
   
   # For Android emulator
   EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
   
   # For physical device (replace with your computer's LAN IP)
   EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000/api
   ```

5. **Note on Expo Go vs Native Build**:
   - The app uses `expo-speech-recognition` which requires native code
   - **Cannot** run on Expo Go anymore
   - **Must** use a dev-client build: `npx expo run:android` or `npx expo run:ios`
   - Or build via EAS: `eas build --platform android --profile preview`

6. **Start development**:
   ```bash
   # Start the development server
   npx expo start
   
   # In a separate terminal, build for your platform:
   # For Android
   npx expo run:android
   
   # For iOS (macOS only)
   npx expo run:ios
   ```

### Local Server Setup

The local server is optional and allows processing OCR and voice commands on your machine instead of the cloud.

1. **Navigate to local-server directory**:
   ```bash
   cd local-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   
   Or with custom port:
   ```bash
   PORT=3001 npm start
   ```

4. **In the mobile app**, go to **Settings → Local AI server** and enter the public URL of your tunnel (using a service like ngrok or Cloudflare Tunnel).

**Note**: The local server currently returns `501 NOT_IMPLEMENTED` for OCR and voice processing. To enable:
- **OCR**: Install Tesseract or use Ollama with a vision model
- **Voice**: Use Ollama with a language model and call the backend API with the action

See `local-server/README.md` for detailed implementation instructions.

## Running the Application

### Full Stack Development

**Terminal 1 - Backend**:
```bash
cd backend
npm run dev
```

**Terminal 2 - Mobile**:
```bash
cd mobile
npx expo run:android  # or ios
```

**Terminal 3 (optional) - Local Server**:
```bash
cd local-server
npm start
```

### Accessing the Application

- **Backend API**: http://localhost:4000
- **Health Check**: http://localhost:4000/health
- **Mobile App**: Runs on your Android device/emulator or iOS simulator

### Test Data / Initial Setup

1. **Register a family member**:
   - Mobile number (any 10-digit number in dev)
   - Create MPIN (4-6 digits)
   - Confirm MPIN

2. **Explore features**:
   - Create a task with a reminder
   - Add a finance account and transaction
   - Create a contact
   - Create a family event
   - (If AI enabled) Use the Assistant tab for chat

## Configuration

### Backend Configuration

All configuration is via environment variables in `backend/.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 4000 | Server port |
| `NODE_ENV` | development | Environment (development/production/test) |
| `MONGO_URI` | (empty) | MongoDB connection string (empty = in-memory dev DB) |
| `JWT_ACCESS_SECRET` | (required) | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | (required) | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | 15m | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | 30d | Refresh token expiry |
| `CORS_ORIGIN` | * | CORS allowed origins |
| `GEMINI_API_KEY` | (optional) | Google Gemini API key |
| `GEMINI_MODEL` | gemini-3.6-flash | Gemini model to use |
| `ADMIN_MOBILE_NUMBERS` | (optional) | Comma-separated admin phone numbers |

### Mobile App Configuration

All configuration is via environment variables in `mobile/.env`:

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API base URL (single server, no fallover) |
| `EXPO_PUBLIC_API_URLS` | Comma-separated list of backend URLs with automatic fallover |

**Production URLs** (with automatic fallover):
```
EXPO_PUBLIC_API_URLS=https://tasks-g9h1.onrender.com/api, https://we-three-api.onrender.com/api
```

**Server Failover Logic**:
- The app tries the primary server (`tasks-g9h1.onrender.com`) first
- If it's unreachable or returns 502/503/504, the app automatically switches to the fallback (`we-three-api.onrender.com`)
- The client stays on whichever server is working until it fails
- Requests are queued offline if both servers fail and synced when connectivity returns

### Feature Flags

The application supports feature flags for progressive rollout of features. Configure via the admin interface or database.

## API Documentation

### Authentication Flow

1. **Register**: `POST /api/auth/register`
   ```json
   {
     "mobileNumber": "9876543210",
     "mpin": "1234"
   }
   ```
   Returns: `{ accessToken, refreshToken, userId }`

2. **Login**: `POST /api/auth/login`
   ```json
   {
     "mobileNumber": "9876543210",
     "mpin": "1234"
   }
   ```
   Returns: `{ accessToken, refreshToken, userId }`

3. **Refresh Token**: `POST /api/auth/refresh`
   - Requires: `refreshToken` header
   - Returns: New `accessToken`

### Example API Calls

**Create a Task**:
```bash
curl -X POST http://localhost:4000/api/tasks \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "description": "Milk, eggs, bread",
    "priority": "high",
    "dueDate": "2024-12-31T18:00:00Z"
  }'
```

**Get Upcoming Reminders**:
```bash
curl http://localhost:4000/api/reminders/upcoming \
  -H "Authorization: Bearer <access-token>"
```

**Create a Finance Transaction**:
```bash
curl -X POST http://localhost:4000/api/finance/transactions \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "account-id",
    "amount": 500,
    "type": "cash-out",
    "category": "groceries",
    "description": "Weekly shopping"
  }'
```

**Send a Message to AI Assistant**:
```bash
curl -X POST http://localhost:4000/api/assistant/message \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is my total spending this month?"
  }'
```

For complete API documentation, refer to individual route files in `backend/src/routes/`.

## Testing

### Running Backend Tests

```bash
cd backend
npm test
```

**Test Coverage**:
- 38+ tests covering authentication, tasks, finance, search, admin, and assistant
- Each test run uses a fresh in-memory MongoDB
- Tests verify business logic, validation, and data isolation

**Key Test Findings** (bugs caught):
1. **Compound Sparse Index Gotcha**: Fixed idempotency-key unique index to use `partialFilterExpression`
2. **Rate Limiter in Tests**: Rate limiters are skipped under `NODE_ENV=test`

### Running Mobile Tests

```bash
cd mobile
npm test
```

### Test Coverage Areas

- **Auth**: User registration, login, token refresh, MPIN validation
- **Tasks**: Create, read, update, delete, reminders, calendar
- **Finance**: Accounts, transactions, balance calculations, group expenses
- **Search**: Global search across tasks, transactions, contacts
- **Admin**: User management, feature flags
- **Assistant**: Gemini integration, tool-calling safety
- **Offline**: Queue management, idempotent sync

## Deployment

### Production Environment Setup

1. **Database**: MongoDB Atlas
   - Create cluster at mongodb.com
   - Get connection string
   - Set `MONGO_URI` in production environment

2. **API Keys**:
   - Generate JWT secrets: `openssl rand -hex 32`
   - Get Gemini API key from https://aistudio.google.com/apikey
   - Never commit these to git

3. **CORS Configuration**:
   - Set `CORS_ORIGIN` to your actual frontend domain(s)
   - Remove `*` from production

### Deploying to Render

The repository includes a `render.yaml` blueprint for automatic deployment:

1. **Push code to GitHub**
2. **Connect to Render.com**:
   - Choose "New" → "Blueprint"
   - Select this repository
   - Render auto-detects `render.yaml`
3. **Configure secrets**:
   - `MONGO_URI`: Your MongoDB Atlas connection string
   - `JWT_ACCESS_SECRET`: Generated secret
   - `JWT_REFRESH_SECRET`: Generated secret
   - `GEMINI_API_KEY`: Gemini API key
4. **Deploy**: Render automatically deploys on git push

**Health Check**: Render pings `/health` for liveness verification

### Docker Deployment

Build and run the Docker image manually:

```bash
# Build
cd backend
docker build -t we-three-api:latest .

# Run
docker run -p 4000:4000 \
  -e MONGO_URI="mongodb+srv://..." \
  -e JWT_ACCESS_SECRET="..." \
  -e JWT_REFRESH_SECRET="..." \
  -e GEMINI_API_KEY="..." \
  -e NODE_ENV=production \
  we-three-api:latest
```

### Mobile App Deployment

**iOS App Store**:
```bash
cd mobile
eas build --platform ios
eas submit --platform ios
```

**Google Play Store**:
```bash
cd mobile
eas build --platform android
eas submit --platform android
```

**Requires**:
- EAS account (free tier available)
- Apple Developer account (paid, $99/year)
- Google Play Developer account (paid, $25 one-time)

## Production Hardening

The application includes production-ready features:

### Security
- **CORS**: Configurable allowed origins
- **Helmet**: HTTP security headers
- **JWT**: Secure token-based authentication
- **Password Hashing**: bcryptjs with salt rounds
- **Rate Limiting**: Prevents brute force (registration: 10 req/hour)
- **Input Validation**: Zod schemas on all inputs

### Performance
- **Indexes**: MongoDB indexes on frequently queried fields
- **Caching**: Dashboard cache for offline support
- **Compression**: HTTP compression via Express
- **Lazy Loading**: Mobile app components lazy-loaded

### Reliability
- **Health Checks**: `/health` endpoint for monitoring
- **Error Handling**: Structured error responses
- **Logging**: Morgan HTTP logging + custom logger
- **Database Connection**: Automatic connection pooling
- **Graceful Shutdown**: Handles SIGINT/SIGTERM signals

### Configuration
- **Multi-stage Docker Build**: Slim production image
- **Environment-specific Config**: Dev vs. production modes
- **Trust Proxy**: Set to `1` for reverse proxy/load balancer
- **Non-root User**: Docker runs as `node` user for security

## Offline Support

### How It Works

1. **Queue Creation**: When offline, new tasks/transactions are queued locally (AsyncStorage)
2. **Idempotency Keys**: Each queued item gets a unique client-generated idempotency key
3. **Auto Sync**: Automatically syncs when:
   - App starts (if online)
   - Device goes from offline to online
4. **Duplicate Prevention**: Backend recognizes idempotency key and returns original record

### Cached Data

- **Home Dashboard**: Last successful load cached, shown with offline banner
- **Other Screens**: Not cached (next feature if needed)

### Limitations

Currently supports:
- Creating tasks (new tasks only, not edits)
- Creating transactions (new transactions only)

Not yet supported:
- Editing/deleting items offline
- Full offline browsing of existing data
- Pull-to-refresh while offline

## Security

### Authentication

- **Mobile Number + MPIN**: No OTP required
- **JWT Tokens**: Access (15min) + Refresh (30d)
- **Data Isolation**: Each user only sees their own data (verified in tests)

### Financial Security

- **Confirmation Flow**: Required for money-related actions (when enabled)
- **Amount Validation**: Prevents negative amounts
- **Transaction Idempotency**: Prevents double-charging on retries

### API Security

- **Validation**: All inputs validated with Zod schemas
- **Rate Limiting**: Prevents brute force attacks
- **CORS**: Restricted to configured origins
- **Helmet Headers**: Security headers on all responses

### AI Safety

- **Backend-controlled**: Gemini API key never exposed to mobile app
- **Tool-calling Safety**: Backend validates all tool calls before executing
- **Confirmation Required**: User must confirm financial actions from AI

### Database Security

- **No Plaintext**: Passwords hashed with bcryptjs
- **Connection Encryption**: MongoDB Atlas uses TLS
- **Backup**: Handled by MongoDB Atlas

## Troubleshooting

### Backend Issues

**Port 4000 already in use**:
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9
# Or use different port
PORT=5000 npm run dev
```

**MongoDB connection failed**:
- If `MONGO_URI` is empty, it should use in-memory DB
- If set but failing, check Atlas credentials and IP whitelist
- Check firewall/proxy settings

**JWT validation errors**:
- Regenerate secrets: `openssl rand -hex 32`
- Ensure secrets are identical on all server instances
- Clear old tokens in mobile app (logout/login)

**Tests fail with rate limiting**:
- Automatic: Rate limiters are skipped in test mode
- Manual test: Wait 1 hour or delete test data between runs

### Mobile App Issues

**Expo start hangs**:
- Kill all Node processes: `killall node`
- Clear cache: `npm install -g expo-cli@latest` and `rm -rf node_modules`
- Restart metro bundler

**Build fails with ENOSPC**:
- Disk space issue (especially Android builds)
- Clean gradle: `rm -rf ~/.gradle` (on macOS/Linux)
- Clean expo: `rm -rf .expo node_modules && npm install`

**Backend unreachable from device/emulator**:
- Check `EXPO_PUBLIC_API_URL` is correct for your target:
  - iOS simulator: `localhost:4000`
  - Android emulator: `10.0.2.2:4000`
  - Physical device: Use your computer's LAN IP
- Ensure backend is running: `curl http://localhost:4000/health`
- Check firewall allows the port

**Speech recognition not working**:
- Requires dev-client build (not Expo Go)
- Run: `npx expo run:android` or `npx expo run:ios`
- Check microphone permissions in app settings

### Database Issues

**In-memory DB data disappears**:
- Expected behavior: In-memory DB (`MONGO_URI` empty) doesn't persist between restarts
- For persistence, set `MONGO_URI` to MongoDB Atlas connection string

**MongoDB Atlas connection refused**:
- Check IP whitelist includes your current IP (or 0.0.0.0/0 for dev)
- Verify username/password in connection string
- Check network connectivity

### Deployment Issues

**Render deployment fails**:
- Check build logs in Render dashboard
- Ensure all required secrets are set (not in render.yaml)
- Verify `Dockerfile` and source files haven't changed

**Health check fails in production**:
- Ensure backend can reach MongoDB Atlas
- Check `NODE_ENV=production` is set
- Verify required env vars are configured

## Contributing

### Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Backend: TypeScript with Zod validation
   - Mobile: React Native with TypeScript
   - Write tests for new features
   - Update this README if needed

3. **Run tests**:
   ```bash
   # Backend
   cd backend && npm test
   
   # Mobile
   cd mobile && npm test
   ```

4. **Type-check**:
   ```bash
   # Backend
   cd backend && npm run typecheck
   
   # Mobile
   cd mobile && npx tsc --noEmit
   ```

5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add new feature" -m "Detailed description of changes"
   ```

6. **Push and create a pull request**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Standards

- **Language**: TypeScript for backend and mobile
- **Formatting**: Follow existing code style
- **Testing**: Write tests for features and bug fixes
- **Validation**: Use Zod for all input validation
- **Error Handling**: Return structured error responses
- **Documentation**: Comment complex logic

### Project Rules

- **No OTP**: Mobile number registration uses MPIN only
- **No Sensitive Data in Git**: Never commit `.env` files with real secrets
- **No Raw DB Access from Mobile**: All DB access through backend API
- **Idempotent Operations**: APIs should handle duplicate requests safely
- **Data Isolation**: Users only see their own data and family data

## License

This project is provided as-is. Ensure compliance with any third-party dependencies' licenses before using in production.

---

## Quick Reference

### Command Cheat Sheet

```bash
# Backend
cd backend
npm install          # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm test             # Run tests
npm run typecheck    # Check TypeScript

# Mobile
cd mobile
npm install          # Install dependencies
npx expo start       # Start Expo server
npx expo run:android # Build & run on Android
npx expo run:ios     # Build & run on iOS
npm test             # Run tests

# Local Server
cd local-server
npm install          # Install dependencies
npm start            # Start server
PORT=3001 npm start  # Start on custom port

# Useful utilities
openssl rand -hex 32 # Generate JWT secret
npm run build && docker build -t we-three-api . # Build Docker image
```

### Default URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Backend API (Production) | https://tasks-g9h1.onrender.com/api | Main REST API |
| Backend API (Fallback) | https://we-three-api.onrender.com/api | Backup REST API |
| Backend API (Local Dev) | http://localhost:4000 | Local REST API |
| Health Check | http://localhost:4000/health | Liveness probe |
| Local Server | http://localhost:3000 | Optional local AI (OCR/voice) |
| MongoDB (Local) | (in-memory) | Development DB |
| MongoDB Atlas (Prod) | (configured via MONGO_URI) | Production DB |

### Key Files

- `backend/.env.example` - Backend configuration template
- `mobile/.env.example` - Mobile app configuration template
- `backend/Dockerfile` - Production Docker build
- `render.yaml` - Render deployment blueprint
- `backend/jest.config.js` - Test configuration
- `backend/tsconfig.json` - TypeScript configuration

---

For issues, questions, or suggestions, please refer to the original project documentation or create an issue in the repository.
