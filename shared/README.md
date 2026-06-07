# Shared Types

TypeScript type definitions used across backend and frontend.

## Usage

### Backend
```typescript
import { Creative, User, CreativeStatus } from '../shared/types';
```

### Frontend
```typescript
import { Creative, User, CreativeStatus } from '../shared/types';
```

## Type Overview

### Core Entities
- `User` - Team member
- `Creative` - Media file with metadata
- `CreativeStatusRecord` - Status per buyer/GEO
- `Comment` - Discussion threads
- `Bookmark` - User bookmarks
- `Subscription` - GEO + angle alerts
- `Notification` - User notifications
- `Download` - Download audit log

### Enums
- `UserRole` - buyer | lead | admin | designer
- `FileType` - video | image
- `CreativeStatus` - new | working | fading | dead
- `TestingStatus` - testing | working | fading | dead | resurrected
- `TestVolume` - quick | decent | heavy
- `ROICategory` - green | yellow | red

### API Types
- `ApiResponse<T>` - Standard API response wrapper
- `PaginatedResponse<T>` - Paginated results
- `SearchFilters` - Query filters
- `UploadMetadata` - Creative upload data
