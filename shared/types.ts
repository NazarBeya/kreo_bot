export type UserRole = 'buyer' | 'lead' | 'admin' | 'designer';

export interface User {
  id: string;
  telegramId: number;
  username?: string;
  displayName?: string;
  role: UserRole;
  isActive: boolean;
  downloadRestrictedUntil?: string;
  createdAt: string;
  lastActiveAt?: string;
}

export type FileType = 'video' | 'image';

export type CreativeStatus = 'new' | 'working' | 'fading' | 'dead';
export type TestingStatus = 'testing' | 'working' | 'fading' | 'dead' | 'resurrected';
export type TestVolume = 'quick' | 'decent' | 'heavy';
export type ROICategory = 'green' | 'yellow' | 'red';

export interface Creative {
  id: string;
  shortId: string;
  fileUrl: string;
  previewUrl: string;
  fileHash: string;
  fileType: FileType;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  width: number;
  height: number;
  authorId: string;
  author?: User;
  parentCreativeId?: string;
  preland?: string;
  language?: string;
  authorComment?: string;
  geos: string[];
  angles: string[];
  aggregatedStatus: CreativeStatus;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeStatusRecord {
  id: string;
  creativeId: string;
  buyerId: string;
  buyer?: User;
  geoCode: string;
  status: TestingStatus;
  testVolume?: TestVolume;
  roiCategory?: ROICategory;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  creativeId: string;
  authorId: string;
  author?: User;
  text: string;
  parentId?: string;
  createdAt: string;
}

export interface Bookmark {
  userId: string;
  creativeId: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  geoCode?: string;
  angle?: string;
  createdAt: string;
}

export interface Preset {
  id: string;
  userId: string;
  name: string;
  geoCodes: string[];
  angles: string[];
  language?: string;
  preland?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface Download {
  id: string;
  creativeId: string;
  userId: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SearchFilters {
  geos?: string[];
  angles?: string[];
  status?: CreativeStatus;
  sortBy?: 'newest' | 'trending' | 'updated';
  page?: number;
  pageSize?: number;
}

export interface UploadMetadata {
  geos: string[];
  angles: string[];
  language?: string;
  preland?: string;
  authorComment?: string;
}
