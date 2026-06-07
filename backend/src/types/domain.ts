export type UserRole = 'buyer' | 'lead' | 'admin' | 'designer';

export interface User {
  id: string;
  telegram_id: number;
  username?: string;
  display_name?: string;
  role: UserRole;
  is_active: boolean;
  download_restricted_until?: string;
  created_at: string;
  last_active_at?: string;
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
