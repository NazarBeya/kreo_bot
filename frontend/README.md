# Frontend - React + TypeScript Mini App

## Structure

```
src/
├── components/
│   ├── Header.tsx        # Top navigation
│   ├── TabBar.tsx        # Bottom tab navigation
│   ├── CreativeCard.tsx  # Creative preview card
│   ├── FilterPanel.tsx   # Search filters
│   └── Modal/            # Modals
├── pages/
│   ├── Catalog.tsx       # Creative catalog
│   ├── Upload.tsx        # Upload page
│   ├── Search.tsx        # Search page
│   ├── Creative.tsx      # Single creative view
│   ├── Bookmarks.tsx     # Bookmarks page
│   └── Admin.tsx         # Admin panel
├── stores/
│   ├── creatives.ts      # Creative state
│   ├── user.ts           # User state
│   └── ui.ts             # UI state
├── api.ts                # API client
├── config.ts             # Configuration
├── App.tsx               # Root component
└── main.tsx              # Entry point
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Available Pages

- **Catalog** - Browse creatives with filters
- **Upload** - Bulk upload creatives
- **Search** - Search by ID, GEO, angle
- **Bookmarks** - Saved creatives
- **Admin** - Dashboard (lead only)

## Features

✅ Responsive design (mobile-first)
✅ Real-time status updates
✅ Dark mode support (planned)
✅ Offline mode (planned)
✅ Analytics dashboard

## Environment Variables

```
VITE_API_URL=http://localhost:3000
VITE_BOT_USERNAME=creative_bot
```

## Build & Deploy

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Telegram Mini App Integration

The app is built to run as Telegram Web App:

```javascript
// Telegram Web App SDK automatically available
window.Telegram.WebApp.expand();
window.Telegram.WebApp.enableClosingConfirmation();
```

## Styling

- TailwindCSS for utility-first styling
- Responsive design patterns
- Dark mode support (upcoming)
