import React, { useEffect, useState } from 'react';
import apiClient from './api';
import { AdminUsersPanel } from './components/AdminUsersPanel';
import { CreativeStatusPanel } from './components/CreativeStatusPanel';
import { getWatermarkedPreviewUrl } from './utils/preview';

type CreativeStatus = 'new' | 'working' | 'fading' | 'dead';

interface CreativeCard {
    id: string;
    shortId: string;
    previewUrl?: string;
    fileUrl?: string;
    fileHash?: string;
    fileType: 'video' | 'image';
    mimeType?: string;
    sizeBytes?: number;
    durationSec?: number;
    width?: number;
    height?: number;
    geos: string[];
    angles: string[];
    status: CreativeStatus;
    authorId?: string;
    author: string;
    createdAt: string;
    tone: string;
    preland?: string;
    language?: string;
    authorComment?: string;
    authorLifecycleStatus?: 'actual' | 'fading' | 'not_running';
    authorLifecycleUpdatedAt?: string;
    parentShortId?: string;
    testerCount: number;
    commentCount: number;
    bookmarked: boolean;
    isArchived: boolean;
}

interface FeedItem {
    id: string;
    type: string;
    payload: Record<string, any>;
    created_at: string;
    username?: string;
    display_name?: string;
    short_id?: string;
}

interface TesterStatus {
    id: string;
    buyer_name?: string;
    username?: string;
    geo_code: string;
    status: string;
    test_volume?: string;
    roi_category?: string;
    comment?: string;
    updated_at: string;
}

interface CreativeComment {
    id: string;
    text: string;
    created_at: string;
    parent_id?: string | null;
    username?: string;
    display_name?: string;
}

interface CreativeVersion {
    id: string;
    short_id: string;
    parent_short_id?: string;
    aggregated_status: CreativeStatus;
    author_lifecycle_status?: 'actual' | 'fading' | 'not_running';
    created_at: string;
    version_number: number;
    geos: string[];
    angles: string[];
}

interface Subscription {
    id: string;
    geo_code?: string | null;
    angle?: string | null;
}

interface UploadPreset {
    id: string;
    name: string;
    geo_codes: string[];
    angles: string[];
    language?: string;
    preland?: string;
}

interface AdminDashboardData {
    summary: Record<string, number>;
    charts: {
        statuses: Array<{ label: string; value: number }>;
        weekly: Array<{ label: string; uploads: number; downloads: number }>;
        angles: Array<{ label: string; value: number }>;
        moderation: Array<{ label: string; value: number }>;
    };
}

interface AdminAnalyticsData {
    geos: Array<{ label: string; creatives: number; downloads: number; statuses: number; green: number; red: number; hot_score: number }>;
    lifecycle: Array<{ label: string; value: number }>;
    reviewers: Array<{ label: string; reviewed: number; approved: number; rejected: number }>;
    notifications: Array<{ label: string; value: number; unread: number }>;
    roi: Array<{ label: string; value: number }>;
    moderationSla?: { pending: number; avg_hours: number };
    buyerActivity: Array<{
        id: string;
        buyer: string;
        uploads: number;
        tests: number;
        comments: number;
        downloads: number;
        uploads_week: number;
        tests_week: number;
        comments_week: number;
    }>;
    monthDynamics: Array<{ label: string; uploads: number; tests: number; comments: number; downloads: number }>;
    archive: Array<{ label: string; value: number; archived: number }>;
}

interface BuyerTrackRecord {
    id: string;
    username?: string;
    display_name?: string;
    uploads: number;
    comments: number;
    downloads: number;
    statuses: number;
    creatives_tested: number;
    green: number;
    yellow: number;
    red: number;
    working_confirmed_by_others: number;
    green_rate: number;
    prediction_accuracy: number;
    overdue_downloads: number;
    total_activity: number;
    last_status_at?: string;
    last_download_at?: string;
}

interface AdminAngle {
    id: string;
    value: string;
    is_active: boolean;
    sort_order?: number;
}

interface ModerationCreative {
    id: string;
    short_id: string;
    moderation_status: string;
    author_username?: string;
    author_display_name?: string;
    geos: string[];
    angles: string[];
    created_at: string;
}

interface ProfileData {
    user: {
        id?: string;
        username?: string;
        displayName?: string;
        role: string;
        createdAt?: string;
    };
    stats: {
        uploads: number;
        tests: number;
        accuracy: number;
    };
    subscriptions: Subscription[];
    presets: UploadPreset[];
    notificationSettings: Record<string, boolean>;
}

interface TelegramWebApp {
    initData: string;
    initDataUnsafe?: {
        start_param?: string;
    };
    expand: () => void;
    ready: () => void;
}

declare global {
    interface Window {
        Telegram?: { WebApp?: TelegramWebApp };
    }
}

const tones = ['ember', 'violet', 'berry', 'ocean'];

const ViewerWatermarks: React.FC<{ viewerLabel: string; count?: number }> = ({ viewerLabel, count = 6 }) => (
    <div className="watermarks" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
            <span key={index}>{viewerLabel}</span>
        ))}
    </div>
);

const normalizeCreative = (creative: Record<string, any>, index: number): CreativeCard => ({
    id: creative.id,
    shortId: creative.shortId || creative.short_id,
    previewUrl: creative.previewUrl || creative.preview_url,
    fileUrl: creative.fileUrl || creative.file_url,
    fileHash: creative.fileHash || creative.file_hash,
    fileType: creative.fileType || creative.file_type || 'image',
    mimeType: creative.mimeType || creative.mime_type,
    sizeBytes: creative.sizeBytes || creative.size_bytes,
    durationSec: creative.durationSec || creative.duration_sec,
    width: creative.width,
    height: creative.height,
    geos: creative.geos?.filter(Boolean) || [],
    angles: creative.angles?.filter(Boolean) || [],
    status: creative.aggregatedStatus || creative.aggregated_status || 'new',
    author: creative.author?.username
        ? `@${creative.author.username}`
        : creative.author_username
            ? `@${creative.author_username}`
            : creative.author_display_name || 'невідомо',
    authorId: creative.authorId || creative.author_id,
    createdAt: creative.createdAt || creative.created_at,
    preland: creative.preland,
    language: creative.language,
    authorComment: creative.authorComment || creative.author_comment,
    authorLifecycleStatus: creative.authorLifecycleStatus || creative.author_lifecycle_status,
    authorLifecycleUpdatedAt: creative.authorLifecycleUpdatedAt || creative.author_lifecycle_updated_at,
    parentShortId: creative.parentShortId || creative.parent_short_id,
    testerCount: Number(creative.testerCount ?? creative.tester_count ?? 0),
    commentCount: Number(creative.commentCount ?? creative.comment_count ?? 0),
    bookmarked: Boolean(creative.bookmarked || creative.bookmarked_at),
    isArchived: Boolean(creative.isArchived ?? creative.is_archived),
    tone: tones[index % tones.length],
});

const relativeDate = (isoDate: any) => {
    if (!isoDate) {
        return 'щойно';
    }

    let parsedDate: Date;
    if (isoDate instanceof Date) {
        parsedDate = isoDate;
    } else if (typeof isoDate === 'number') {
        parsedDate = new Date(isoDate);
    } else {
        let dateStr = String(isoDate).trim();
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
            dateStr = dateStr.replace(' ', 'T');
        }
        parsedDate = new Date(dateStr);
    }

    const timeMs = parsedDate.getTime();
    if (isNaN(timeMs)) {
        return 'щойно';
    }

    const hours = Math.max(1, Math.round((Date.now() - timeMs) / 3_600_000));

    if (hours < 24) {
        return `${hours} год тому`;
    }

    return `${Math.round(hours / 24)} дн.`;
};

const statusLabels: Record<CreativeStatus, string> = {
    new: 'новинка',
    working: 'працює',
    fading: 'згасає',
    dead: 'мертвий',
};

const navItems = [
    ['▦', 'каталог'],
    ['ϟ', 'стрічка'],
    ['+', 'залити'],
    ['★', 'закладки'],
    ['◐', 'профіль'],
];

const defaultGeos = ['DE', 'IL', 'PL', 'GB', 'US'];
const defaultAngles = ['sugar', 'mature', 'casual', 'MILF', 'asian', 'серйозні стосунки', 'swinger'];
const statusFilters: CreativeStatus[] = ['working', 'fading', 'dead', 'new'];
type SortMode = 'newest' | 'confirmations' | 'updated';
type AppScreen = 'catalog' | 'feed' | 'upload' | 'bookmarks' | 'profile';

interface UploadFileCard {
    id: string;
    file?: File;
    source: 'local' | 'telegram';
    sessionIndex?: number;
    name: string;
    size: string;
    tone: string;
    override: boolean;
    geos: string[];
    angles: string[];
    preland: string;
    authorComment: string;
    parentShortId: string;
    versionLabel: string;
    uploadStatus: 'idle' | 'uploading' | 'success' | 'error' | 'duplicate';
    error?: string;
    shortId?: string;
}

interface UploadMetadata {
    geos: string[];
    angles: string[];
    preland: string;
    authorComment: string;
    parentShortId: string;
    versionLabel: string;
    language?: string;
}

const notificationOptions = [
    { type: 'status_update', label: 'Хтось протестував моє крео' },
    { type: 'download', label: 'Хтось скачав моє крео' },
    { type: 'new_creative', label: 'Нове крео по підписці' },
    { type: 'reminder', label: 'Час оновити статус' },
    { type: 'burnout', label: 'Скачане крео вигоріло' },
    { type: 'comment', label: 'Коментар під моїм крео' },
    { type: 'resurrection', label: 'Крео воскресло з архіву' },
    { type: 'mention', label: 'Згадка через @' },
];

const formatFileSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const previousUploadStorageKey = 'creative_bot_previous_upload_metadata';
const knownPrelandTokens = ['quiz', 'chat', 'landing', 'preland', 'lp', 'survey', 'vsl', 'offer'];

const cleanFileToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '');

const readPreviousUploadMetadata = (): UploadMetadata | null => {
    try {
        const value = localStorage.getItem(previousUploadStorageKey);
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

const writePreviousUploadMetadata = (metadata: UploadMetadata) => {
    localStorage.setItem(previousUploadStorageKey, JSON.stringify(metadata));
};

const detectMetadataFromFileName = (
    fileName: string,
    geoOptions: string[] = defaultGeos,
    angleOptions: string[] = defaultAngles,
): Partial<UploadMetadata> => {
    const nameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
    const tokens = nameWithoutExtension
        .split(/[^a-z0-9а-яіїєґ]+/i)
        .map(cleanFileToken)
        .filter(Boolean);
    const lowerName = cleanFileToken(nameWithoutExtension);
    const geos = geoOptions.filter((geo) => tokens.includes(geo.toLowerCase()));
    const angles = angleOptions.filter((angle) => {
        const normalized = cleanFileToken(angle);
        return tokens.includes(normalized) || lowerName.includes(normalized);
    });
    const prelandIndex = tokens.findIndex((token) => knownPrelandTokens.includes(token));
    const preland = prelandIndex >= 0
        ? tokens.slice(prelandIndex, Math.min(tokens.length, prelandIndex + 4)).join('-')
        : '';
    const parentShortId = nameWithoutExtension.match(/CR-[A-Z0-9]+/i)?.[0].toUpperCase() || '';
    const versionLabel = nameWithoutExtension.match(/(?:^|[^a-z0-9])(v[2-9][0-9]*)(?:[^a-z0-9]|$)/i)?.[1].toLowerCase() || '';

    return {
        ...(geos.length ? { geos } : {}),
        ...(angles.length ? { angles } : {}),
        ...(preland ? { preland } : {}),
        ...(parentShortId ? { parentShortId } : {}),
        ...(versionLabel ? { versionLabel } : {}),
    };
};
const formatDuration = (seconds?: number) => {
    if (!seconds) {
        return 'невідомо';
    }

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const statusText: Record<string, string> = {
    testing: 'тестує',
    working: 'працює',
    fading: 'вигорає',
    dead: 'мертвий',
    resurrected: 'воскресло',
};

const roiText: Record<string, string> = {
    green: 'плюс',
    yellow: '~0',
    red: 'мінус',
};

interface FilterGroupProps {
    label: string;
    options: readonly string[];
    activeOption: string | null;
    onSelect: (option: any) => void;
}

const FilterGroup: React.FC<FilterGroupProps> = ({ label, options, activeOption, onSelect }) => (
    <section className="filter-group">
        <h2>{label}</h2>
        <div className="filter-options">
            {options.map((option) => (
                <button
                    className={option === activeOption ? 'active' : ''}
                    key={option}
                    onClick={() => onSelect(option === activeOption ? null : option)}
                >
                    {option}
                </button>
            ))}
        </div>
    </section>
);

const ProfileSection: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
    <section className="profile-section">
        <h3>{title}</h3>
        {children}
    </section>
);

const BottomNav: React.FC<{ activeScreen: AppScreen; onNavigate: (screen: AppScreen) => void }> = ({
    activeScreen,
    onNavigate,
}) => (
    <nav className="bottom-nav" aria-label="Основна навігація">
        {navItems.map(([icon, label], index) => {
            const screen: AppScreen = index === 1
                ? 'feed'
                : index === 2
                    ? 'upload'
                : index === 3
                    ? 'bookmarks'
                    : index === 4
                        ? 'profile'
                        : 'catalog';
            const isActive = screen === activeScreen;

            return (
                <button
                    className={`${isActive ? 'active' : ''} ${index === 2 ? 'upload' : ''}`}
                    key={label}
                    onClick={() => onNavigate(screen)}
                >
                    <span>{icon}</span>
                    <small>{label}</small>
                </button>
            );
        })}
    </nav>
);

const CreativePreview: React.FC<{
    creative: CreativeCard;
    viewerLabel: string;
    onOpen: (creative: CreativeCard) => void;
}> = ({
    creative,
    viewerLabel,
    onOpen,
}) => (
    <article className="creative-card catalog-card" onClick={() => onOpen(creative)}>
        <div
            className={`creative-preview tone-${creative.tone}`}
            style={{ backgroundImage: `url(${getWatermarkedPreviewUrl(creative.id)})` }}
        >
            <span className={`status-pill status-${creative.status}`}>
                <i />
                {statusLabels[creative.status]}
            </span>
            {creative.isArchived && <span className="archive-badge">архів</span>}
            <ViewerWatermarks viewerLabel={viewerLabel} />
            {creative.fileType === 'video' && <button className="play-button" aria-label="Відтворити прев'ю">▶</button>}
            <div className="geo-list">
                {creative.geos.map((geo) => <span key={geo}>{geo}</span>)}
            </div>
        </div>
        <div className="creative-info">
            <div className="creative-meta">
                <strong>{creative.shortId}</strong>
                <span>{relativeDate(creative.createdAt)}</span>
            </div>
            <div className="creative-meta secondary">
                <b>{creative.angles[0] || 'Без angle'}</b>
                <span>{creative.author}</span>
            </div>
        </div>
    </article>
);

const BookmarkPreview: React.FC<{
    creative: CreativeCard;
    viewerLabel: string;
    onOpen: (creative: CreativeCard) => void;
}> = ({
    creative,
    viewerLabel,
    onOpen,
}) => (
    <article className="creative-card bookmark-card" onClick={() => onOpen(creative)}>
        <div
            className={`creative-preview tone-${creative.tone}`}
            style={{ backgroundImage: `url(${getWatermarkedPreviewUrl(creative.id)})` }}
        >
            <span className={`status-pill status-${creative.status}`}>
                <i />
                {statusLabels[creative.status]}
            </span>
            <ViewerWatermarks viewerLabel={viewerLabel} />
            {creative.fileType === 'video' && <button className="play-button" aria-label="Відтворити прев'ю">▶</button>}
            <div className="geo-list">
                {creative.geos.map((geo) => <span key={geo}>{geo}</span>)}
            </div>
        </div>
        <div className="creative-info">
            <div className="creative-meta">
                <strong>{creative.shortId}</strong>
                <span>{relativeDate(creative.createdAt)}</span>
            </div>
            <div className="creative-meta secondary">
                <b>{creative.angles[0] || 'Без angle'}</b>
                <span>{creative.author}</span>
            </div>
            <div className="bookmark-tests">тестують: {creative.testerCount}</div>
        </div>
    </article>
);

const CreativeDetailsModal: React.FC<{
    creative: CreativeCard;
    currentUser?: ProfileData['user'];
    onClose: () => void;
    onBookmarkToggle: (creative: CreativeCard) => void;
    onCommentAdded: (creativeId: string) => void;
    onResurrect: (creative: CreativeCard) => Promise<void>;
    onLifecycleUpdate: (creative: CreativeCard, status: 'actual' | 'fading' | 'not_running') => Promise<void>;
}> = ({ creative, currentUser, onClose, onBookmarkToggle, onCommentAdded, onResurrect, onLifecycleUpdate }) => {
    const viewerLabel = currentUser?.username
        ? `@${currentUser.username}`
        : currentUser?.displayName || 'невідомо';
    const [activeTab, setActiveTab] = useState<'info' | 'versions' | 'testers' | 'comments'>('info');
    const [testers, setTesters] = useState<TesterStatus[]>([]);
    const [comments, setComments] = useState<CreativeComment[]>([]);
    const [versions, setVersions] = useState<CreativeVersion[]>([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [replyToId, setReplyToId] = useState<string | null>(null);
    const [hasDownloaded, setHasDownloaded] = useState(false);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchTranslation, setTouchTranslation] = useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        const modalElement = e.currentTarget as HTMLElement;
        if (modalElement.scrollTop <= 0) {
            setTouchStart(e.targetTouches[0].clientY);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return;
        const currentTouch = e.targetTouches[0].clientY;
        const diff = currentTouch - touchStart;
        if (diff > 0) {
            setTouchTranslation(diff);
            if (e.cancelable) {
                e.preventDefault();
            }
        } else {
            setTouchTranslation(0);
        }
    };

    const handleTouchEnd = () => {
        if (touchStart !== null) {
            if (touchTranslation > 150) {
                onClose();
            }
            setTouchStart(null);
            setTouchTranslation(0);
        }
    };

    const testerCount = creative.testerCount;
    const commentCount = creative.commentCount;
    const canManageLifecycle = Boolean(
        currentUser
        && (currentUser.role === 'admin' || currentUser.role === 'lead' || currentUser.id === creative.authorId)
    );

    useEffect(() => {
        const loadDetails = async () => {
            setDetailsLoading(true);

            try {
                const [statusesResponse, commentsResponse, contextResponse, versionsResponse] = await Promise.all([
                    apiClient.get(`/api/status/${creative.id}`),
                    apiClient.get(`/api/app/creatives/${creative.id}/comments`),
                    apiClient.get(`/api/creatives/${creative.id}/context`),
                    apiClient.get(`/api/creatives/${creative.id}/versions`),
                ]);
                setTesters(statusesResponse.data.data);
                setComments(commentsResponse.data.data);
                setHasDownloaded(Boolean(contextResponse.data.data.hasDownloaded));
                setVersions(versionsResponse.data.data);
            } finally {
                setDetailsLoading(false);
            }
        };

        void loadDetails();
    }, [creative.id]);

    const submitComment = async () => {
        const text = commentText.trim();

        if (!text) {
            return;
        }

        const response = await apiClient.post(`/api/app/creatives/${creative.id}/comments`, {
            text,
            parentId: replyToId,
        });
        setComments((current) => [response.data.data, ...current]);
        setCommentText('');
        setReplyToId(null);
        onCommentAdded(creative.id);
    };

    return (
        <div className="details-backdrop" onClick={onClose}>
            <article 
                className="details-modal" 
                onClick={(event) => event.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                    transform: `translateY(${touchTranslation}px)`,
                    transition: touchTranslation === 0 ? 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
                }}
            >
            <div className="details-handle" />
            <div
                className={`details-preview tone-${creative.tone}`}
                style={{ backgroundImage: `url(${getWatermarkedPreviewUrl(creative.id)})` }}
            >
                <span className={`status-pill status-${creative.status}`}>
                    <i />
                    {statusLabels[creative.status]}
                </span>
                {creative.isArchived && <span className="archive-badge">архів</span>}
                <ViewerWatermarks viewerLabel={viewerLabel} />
                <button className="play-button" aria-label="Відтворити прев'ю">▶</button>
                <div className="geo-list">
                    {creative.geos.map((geo) => <span key={geo}>{geo}</span>)}
                </div>
            </div>
            <section className="details-content">
                <div className="details-title-line">
                    <strong>{creative.shortId}</strong>
                    <span>залив {creative.author} · {relativeDate(creative.createdAt)}</span>
                </div>
                <h2>{creative.angles[0] || 'Без angle'} · {creative.geos.join(' · ') || 'GEO н/д'}</h2>
                <p className={`details-status status-${creative.status}`}>
                    <i />
                    {statusLabels[creative.status]}
                    <span>· {testerCount} тестери</span>
                </p>
                {canManageLifecycle && (
                    <div className="lifecycle-actions">
                        <button
                            className={creative.authorLifecycleStatus === 'actual' ? 'active' : ''}
                            onClick={() => void onLifecycleUpdate(creative, 'actual')}
                        >
                            актуальний
                        </button>
                        <button
                            className={creative.authorLifecycleStatus === 'fading' ? 'active warning' : 'warning'}
                            onClick={() => void onLifecycleUpdate(creative, 'fading')}
                        >
                            вигорає
                        </button>
                        <button
                            className={creative.authorLifecycleStatus === 'not_running' ? 'active muted' : 'muted'}
                            onClick={() => void onLifecycleUpdate(creative, 'not_running')}
                        >
                            не лию
                        </button>
                    </div>
                )}
                <div className="details-actions">
                    <button
                        className="download"
                        onClick={async () => {
                            const response = await apiClient.get(`/api/creatives/${creative.id}/download`);
                            window.open(response.data.url, '_blank');
                            setHasDownloaded(true);
                        }}
                    >
                        📥 завантажити
                    </button>
                    <button onClick={() => onBookmarkToggle(creative)}>
                        {creative.bookmarked ? '🔖 в закладках' : '🔖 додати'}
                    </button>
                    {creative.isArchived && (
                        <button className="resurrect" onClick={() => void onResurrect(creative)}>
                            ⚡ воскресити
                        </button>
                    )}
                </div>
                {hasDownloaded && currentUser?.role !== 'designer' && (
                    <CreativeStatusPanel
                        creativeId={creative.id}
                        geos={creative.geos}
                        onUpdated={() => {
                            void apiClient.get(`/api/status/${creative.id}`).then((response) => {
                                setTesters(response.data.data);
                            });
                        }}
                    />
                )}
                <div className="details-tabs">
                    <button className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>інфо</button>
                    <button className={activeTab === 'versions' ? 'active' : ''} onClick={() => setActiveTab('versions')}>
                        версії {versions.length || ''}
                    </button>
                    <button className={activeTab === 'testers' ? 'active' : ''} onClick={() => setActiveTab('testers')}>
                        тестери {testerCount}
                    </button>
                    <button className={activeTab === 'comments' ? 'active' : ''} onClick={() => setActiveTab('comments')}>
                        коментарі {commentCount}
                    </button>
                </div>
                {activeTab === 'info' && <div className="details-info">
                    <DetailField label="гео">{creative.geos.join(', ')}</DetailField>
                    <DetailField label="angle">{creative.angles[0]?.toLowerCase() || 'не вказано'}</DetailField>
                    <DetailField label="преленд">{creative.preland || 'не вказано'}</DetailField>
                    <DetailField label="мова крео">{creative.language || 'не вказано'}</DetailField>
                    <DetailField label="коментар автора">{creative.authorComment || 'без коментаря'}</DetailField>
                    <DetailField label="версія">{creative.parentShortId ? `версія від ${creative.parentShortId}` : 'оригінал'}</DetailField>
                    {versions.length > 0 && (
                        <section className="version-strip">
                            {versions.map((version) => (
                                <button
                                    className={version.id === creative.id ? 'active' : ''}
                                    key={version.id}
                                    onClick={() => setActiveTab('versions')}
                                >
                                    v{version.version_number}
                                </button>
                            ))}
                        </section>
                    )}
                    <section className="technical-info">
                        <h3>технічно</h3>
                        <div>
                            <DetailField label="хеш">{creative.fileHash ? `${creative.fileHash.slice(0, 8)}...` : 'невідомо'}</DetailField>
                            <DetailField label="розмір">{creative.sizeBytes ? formatFileSize(creative.sizeBytes) : 'невідомо'}</DetailField>
                            <DetailField label="тривалість">{formatDuration(creative.durationSec)}</DetailField>
                            <DetailField label="формат">{creative.width && creative.height ? `${creative.width}:${creative.height}` : 'невідомо'} / {creative.mimeType || creative.fileType}</DetailField>
                        </div>
                    </section>
                </div>}
                {activeTab === 'versions' && (
                    <div className="version-list">
                        {detailsLoading ? (
                            <p className="state-message">завантаження версій...</p>
                        ) : versions.length ? (
                            versions.map((version) => (
                                <article className={version.id === creative.id ? 'active' : ''} key={version.id}>
                                    <div>
                                        <strong>v{version.version_number} · {version.short_id}</strong>
                                        <small>{version.parent_short_id ? `від ${version.parent_short_id}` : 'оригінал'} · {relativeDate(version.created_at)}</small>
                                    </div>
                                    <span>{statusLabels[version.aggregated_status] || version.aggregated_status}</span>
                                    <p>{version.geos.filter(Boolean).join(' · ') || 'geo'} · {version.angles.filter(Boolean).join(' · ') || 'angle'}</p>
                                </article>
                            ))
                        ) : (
                            <div className="details-empty">
                                <h3>версій ще немає</h3>
                                <p>завантаж v2/v3 з parent CR-ID</p>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'testers' && (
                    detailsLoading ? (
                        <p className="state-message">завантаження тестерів...</p>
                    ) : testers.length ? (
                        <div className="tester-list">
                            {testers.map((tester) => {
                                const tone = tester.status === 'fading' || tester.roi_category === 'yellow' ? 'fading' : 'success';

                                return (
                                <article className="tester-card" key={tester.id}>
                                    <div className="tester-topline">
                                        <div>
                                            <i className={`tester-dot ${tone}`} />
                                            <strong>{tester.username ? `@${tester.username}` : tester.buyer_name || 'баєр'}</strong>
                                            <small>{tester.geo_code}</small>
                                        </div>
                                        <time>{relativeDate(tester.updated_at)}</time>
                                    </div>
                                    <p className={`tester-result ${tone}`}>
                                        {statusText[tester.status] || tester.status}
                                        <span>· {tester.test_volume || 'обсяг н/д'} ·</span>
                                        <i />
                                        <span>{tester.roi_category ? roiText[tester.roi_category] : 'результат н/д'}</span>
                                    </p>
                                </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="details-empty">
                            <h3>ще ніхто не тестував</h3>
                            <p>будь першим — натисни "Завантажити"</p>
                        </div>
                    )
                )}
                {activeTab === 'comments' && (
                    <div className="details-comments">
                        {detailsLoading ? (
                            <p className="state-message">завантаження коментарів...</p>
                        ) : comments.length ? (
                            <div className="comment-list">
                                {comments.map((comment) => (
                                    <article className={`comment-card ${comment.parent_id ? 'reply' : ''}`} key={comment.id}>
                                        <div>
                                            <strong>{comment.username ? `@${comment.username}` : comment.display_name || 'користувач'}</strong>
                                            <time>{relativeDate(comment.created_at)}</time>
                                            <button onClick={() => setReplyToId(comment.id)}>відповісти</button>
                                        </div>
                                        <p>{comment.text}</p>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="details-empty">
                                <h3>тиша</h3>
                                <p>стань першим хто щось напише</p>
                            </div>
                        )}
                        <div className="comment-form">
                            <input
                                placeholder="написати коментар..."
                                value={commentText}
                                onChange={(event) => setCommentText(event.target.value)}
                            />
                            <button onClick={submitComment}>надіслати</button>
                        </div>
                    </div>
                )}
            </section>
        </article>
    </div>
    );
};

const DetailField: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
    <div className="detail-field">
        <small>{label}</small>
        <p>{children}</p>
    </div>
);

const UploadScreen: React.FC<{
    presets: UploadPreset[];
    uploaderLabel: string;
    geoOptions: string[];
    angleOptions: string[];
    languageOptions: string[];
    telegramUploadSessionId?: string | null;
    onUploaded: () => Promise<void>;
}> = ({ presets, uploaderLabel, geoOptions, angleOptions, languageOptions, telegramUploadSessionId, onUploaded }) => {
    const availablePresets = presets;
    const [files, setFiles] = useState<UploadFileCard[]>([]);
    const [selectedGeos, setSelectedGeos] = useState(['DE', 'IL']);
    const [selectedAngles, setSelectedAngles] = useState(['sugar']);
    const [language, setLanguage] = useState('');
    const [preland, setPreland] = useState('');
    const [uploadedIds, setUploadedIds] = useState<string[]>([]);
    const [authorComment, setAuthorComment] = useState('');
    const [parentShortId, setParentShortId] = useState('');
    const [versionLabel, setVersionLabel] = useState('');
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [showPresetPicker, setShowPresetPicker] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);
    const [loadedTelegramSessionId, setLoadedTelegramSessionId] = useState<string | null>(null);

    const toggleValue = (value: string, current: string[], setCurrent: (values: string[]) => void) => {
        setCurrent(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    };

    const updateFile = (fileId: string, changes: Partial<UploadFileCard>) => {
        setFiles((current) => current.map((file) => (
            file.id === fileId ? { ...file, ...changes } : file
        )));
    };

    const toggleFileValue = (fileId: string, value: string, key: 'geos' | 'angles') => {
        setFiles((current) => current.map((file) => {
            if (file.id !== fileId) {
                return file;
            }

            const values = file[key];
            return {
                ...file,
                [key]: values.includes(value)
                    ? values.filter((item) => item !== value)
                    : [...values, value],
            };
        }));
    };

    const selectFiles = (fileList: FileList | null) => {
        if (!fileList) {
            return;
        }

        const selected = Array.from(fileList);

        setFiles((current) => {
            const knownIds = new Set(current.map((file) => file.id));
            const availableSlots = Math.max(0, 50 - current.length);
            const nextFiles = selected.slice(0, availableSlots).map((file, index) => {
                const detected = detectMetadataFromFileName(file.name, geoOptions, angleOptions);
                const hasDetectedMetadata = Boolean(
                    detected.geos?.length
                    || detected.angles?.length
                    || detected.preland
                    || detected.parentShortId
                    || detected.versionLabel
                );

                return {
                    id: `${file.name}-${file.lastModified}-${file.size}`,
                    file,
                    source: 'local' as const,
                    name: file.name,
                    size: formatFileSize(file.size),
                    tone: ['berry', 'ocean', 'amber', 'mint'][index % 4],
                    override: hasDetectedMetadata,
                    geos: detected.geos || selectedGeos,
                    angles: detected.angles || selectedAngles,
                    preland: detected.preland || preland,
                    authorComment,
                    parentShortId: detected.parentShortId || parentShortId,
                    versionLabel: detected.versionLabel || versionLabel,
                    uploadStatus: 'idle' as const,
                };
            }).filter((file) => !knownIds.has(file.id));

            return [...current, ...nextFiles].slice(0, 50);
        });
        setUploadMessage(null);
    };

    useEffect(() => {
        if (!telegramUploadSessionId || loadedTelegramSessionId === telegramUploadSessionId) {
            return;
        }

        const loadTelegramSession = async () => {
            try {
                const response = await apiClient.get(`/api/app/upload-sessions/${telegramUploadSessionId}`);
                const sessionFiles = response.data.data.files as Array<{
                    id: string;
                    index: number;
                    fileName: string;
                    size: number;
                }>;

                setFiles(sessionFiles.map((sessionFile, index) => {
                    const detected = detectMetadataFromFileName(sessionFile.fileName);
                    const hasDetectedMetadata = Boolean(
                        detected.geos?.length
                        || detected.angles?.length
                        || detected.preland
                        || detected.parentShortId
                        || detected.versionLabel
                    );

                    return {
                        id: sessionFile.id,
                        source: 'telegram' as const,
                        sessionIndex: sessionFile.index,
                        name: sessionFile.fileName,
                        size: formatFileSize(sessionFile.size || 0),
                        tone: ['berry', 'ocean', 'amber', 'mint'][index % 4],
                        override: hasDetectedMetadata,
                        geos: detected.geos || selectedGeos,
                        angles: detected.angles || selectedAngles,
                        preland: detected.preland || preland,
                        authorComment,
                        parentShortId: detected.parentShortId || parentShortId,
                        versionLabel: detected.versionLabel || versionLabel,
                        uploadStatus: 'idle' as const,
                    };
                }));
                setLoadedTelegramSessionId(telegramUploadSessionId);
                setUploadMessage(`батч із бота підключено: ${sessionFiles.length} файлів`);
            } catch (requestError: any) {
                setUploadMessage(requestError.response?.data?.error || 'Не вдалося підключити батч із бота');
            }
        };

        void loadTelegramSession();
    }, [
        authorComment,
        loadedTelegramSessionId,
        parentShortId,
        preland,
        selectedAngles,
        selectedGeos,
        telegramUploadSessionId,
        versionLabel,
    ]);

    const applyMetadata = (metadata: UploadMetadata) => {
        setSelectedGeos(metadata.geos || []);
        setSelectedAngles(metadata.angles || []);
        setPreland(metadata.preland || '');
        setAuthorComment(metadata.authorComment || '');
        setParentShortId(metadata.parentShortId || '');
        setVersionLabel(metadata.versionLabel || '');
    };

    const applyPreset = (presetInput?: UploadPreset) => {
        const preset = presetInput || availablePresets.find((item) => item.id === selectedPresetId) || availablePresets[0];

        if (!preset) {
            return;
        }

        applyMetadata({
            geos: preset.geo_codes,
            angles: preset.angles,
            preland: preset.preland || '',
            authorComment,
            parentShortId,
            versionLabel,
        });
        setSelectedPresetId(preset.id);
        setShowPresetPicker(false);
        setUploadMessage(`пресет застосовано: ${preset.name}`);
    };

    const applyPreviousUpload = () => {
        const previous = readPreviousUploadMetadata();

        if (!previous) {
            setUploadMessage('попередніх metadata ще немає');
            return;
        }

        applyMetadata(previous);
        setUploadMessage('metadata взято з минулого upload');
    };

    const submitUpload = async () => {
        if (files.length === 0 || selectedGeos.length === 0 || selectedAngles.length === 0 || uploading) {
            return;
        }

        setUploading(true);
        setUploadMessage(null);
        setFiles((current) => current.map((file) => ({ ...file, uploadStatus: 'uploading' as const, error: undefined })));

        try {
            const formData = new FormData();
            files.forEach((file) => {
                if (file.file) {
                    formData.append('files', file.file, file.name);
                }
            });
            if (telegramUploadSessionId) {
                formData.append('telegramUploadSessionId', telegramUploadSessionId);
            }
            formData.append('geos', JSON.stringify(selectedGeos));
            formData.append('angles', JSON.stringify(selectedAngles));
            if (language) {
                formData.append('language', language);
            }
            formData.append('preland', preland);
            formData.append('authorComment', [authorComment, versionLabel].filter(Boolean).join(' · '));
            formData.append('parentShortId', parentShortId);
            formData.append('overrides', JSON.stringify(files.map((file) => (
                file.override
                    ? {
                        geos: file.geos,
                        angles: file.angles,
                        preland: file.preland,
                        authorComment: [file.authorComment, file.versionLabel].filter(Boolean).join(' · '),
                        parentShortId: file.parentShortId,
                    }
                    : {}
            ))));
            writePreviousUploadMetadata({
                geos: selectedGeos,
                angles: selectedAngles,
                preland,
                authorComment,
                parentShortId,
                versionLabel,
            });

            const response = await apiClient.post('/api/creatives/bulk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const results = response.data.data as Array<Record<string, any>>;

            setFiles((current) => current.map((file, index) => {
                const result = results.find((item) => item.index === index);

                if (!result) {
                    return { ...file, uploadStatus: 'error', error: 'Немає відповіді від API' };
                }

                if (!result.success) {
                    return { ...file, uploadStatus: 'error', error: result.error || 'Не вдалося залити' };
                }

                return {
                    ...file,
                    uploadStatus: result.duplicate ? 'duplicate' : 'success',
                    shortId: result.creative?.short_id || result.creative?.shortId,
                };
            }));
            const ids = results
                .filter((item) => item.success && item.creative)
                .map((item) => item.creative.short_id || item.creative.shortId)
                .filter(Boolean) as string[];
            setUploadedIds(ids);
            setUploadMessage(`готово: ${response.data.summary.succeeded}/${response.data.summary.total}`);
            await onUploaded();
        } catch (requestError: any) {
            setUploadMessage(requestError.response?.data?.error || 'Не вдалося залити батч');
            setFiles((current) => current.map((file) => (
                file.uploadStatus === 'uploading'
                    ? { ...file, uploadStatus: 'error' as const, error: 'Запит не завершився' }
                    : file
            )));
        } finally {
            setUploading(false);
        }
    };

    return (
        <section className="upload-screen">
            <header className="broadcast">mini app · живі дані API</header>
            <div className="upload-heading">
                <h1>залити крео<span>.</span></h1>
            </div>
            <div className="upload-content">
                <label
                    className={`upload-dropzone ${isDragging ? 'active' : ''}`}
                    onDragEnter={() => setIsDragging(true)}
                    onDragLeave={() => setIsDragging(false)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        setIsDragging(false);
                        selectFiles(event.dataTransfer.files);
                    }}
                >
                    <input
                        multiple
                        type="file"
                        accept="image/*,video/mp4,video/quicktime,video/webm"
                        onChange={(event) => selectFiles(event.target.files)}
                    />
                    <span>📁 кинь файли сюди</span>
                    <strong>до 50 файлів за раз</strong>
                    <small>{files.length} вибрано</small>
                </label>
                <div className="upload-shortcuts">
                    <button
                        className={showPresetPicker ? 'active' : ''}
                        onClick={() => setShowPresetPicker((current) => !current)}
                    >
                        ϟ пресет
                    </button>
                    <button onClick={applyPreviousUpload}>↻ як минулого разу</button>
                </div>
                {showPresetPicker && (
                    <section className="preset-picker">
                        <h2>обери пресет</h2>
                        <div className="preset-picker-list">
                            {availablePresets.map((preset) => {
                                const isActive = preset.id === selectedPresetId;

                                return (
                                    <button
                                        className={isActive ? 'active' : ''}
                                        key={preset.id}
                                        onClick={() => applyPreset(preset)}
                                    >
                                        <strong>{preset.name}</strong>
                                        <small>{preset.geo_codes.join(', ') || 'GEO н/д'} · {preset.angles.join(', ') || 'angle н/д'}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}
                <section className="batch-settings">
                    <h2>спільне для всього батчу</h2>
                    <UploadOptionGroup
                        label="гео ·"
                        options={geoOptions}
                        selected={selectedGeos}
                        onToggle={(value) => toggleValue(value, selectedGeos, setSelectedGeos)}
                    />
                    <UploadOptionGroup
                        label="angle ·"
                        options={angleOptions}
                        selected={selectedAngles}
                        onToggle={(value) => toggleValue(value, selectedAngles, setSelectedAngles)}
                    />
                    {languageOptions.length > 0 && (
                        <label className="preland-field">
                            <span>мова крео (опц.)</span>
                            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                                <option value="">не вказано</option>
                                {languageOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label className="preland-field">
                        <span>преленд (опц.)</span>
                        <input
                            onChange={(event) => setPreland(event.target.value)}
                            placeholder="назва преленду"
                            value={preland}
                        />
                    </label>
                    <label className="preland-field">
                        <span>коментар автора (опц.)</span>
                        <input
                            onChange={(event) => setAuthorComment(event.target.value)}
                            placeholder="що важливо знати баєрам"
                            value={authorComment}
                        />
                    </label>
                    <div className="version-fields">
                        <label className="preland-field">
                            <span>parent creative</span>
                            <input
                                onChange={(event) => setParentShortId(event.target.value.toUpperCase())}
                                placeholder="CR-A7F3K"
                                value={parentShortId}
                            />
                        </label>
                        <label className="preland-field">
                            <span>версія</span>
                            <input
                                onChange={(event) => setVersionLabel(event.target.value.toLowerCase())}
                                placeholder="v2 / v3"
                                value={versionLabel}
                            />
                        </label>
                    </div>
                </section>
                <section className="upload-file-section">
                    <h2>файли · {files.length}</h2>
                    <div className="upload-file-grid">
                        {files.map((file) => (
                            <UploadPreview
                                file={file}
                                key={file.id}
                                uploaderLabel={uploaderLabel}
                                geoOptions={geoOptions}
                                angleOptions={angleOptions}
                                onRemove={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                                onToggleOverride={() => updateFile(file.id, {
                                    override: !file.override,
                                    geos: file.geos.length ? file.geos : selectedGeos,
                                    angles: file.angles.length ? file.angles : selectedAngles,
                                    preland: file.preland || preland,
                                    authorComment: file.authorComment || authorComment,
                                    parentShortId: file.parentShortId || parentShortId,
                                    versionLabel: file.versionLabel || versionLabel,
                                })}
                                onToggleValue={(value, key) => toggleFileValue(file.id, value, key)}
                                onUpdate={updateFile}
                            />
                        ))}
                    </div>
                </section>
                <button
                    className="submit-upload"
                    disabled={uploading || files.length === 0 || selectedGeos.length === 0 || selectedAngles.length === 0}
                    onClick={() => void submitUpload()}
                >
                    {uploading ? 'заливаю...' : `залити ${files.length} крео`}
                </button>
                <p className="upload-note">{uploadMessage || 'бот згенерує ID для кожного і повідомить'}</p>
                {uploadedIds.length > 0 && (
                    <button
                        className="copy-ids"
                        onClick={() => void navigator.clipboard.writeText(uploadedIds.join('\n'))}
                    >
                        скопіювати ID ({uploadedIds.length})
                    </button>
                )}
            </div>
        </section>
    );
};

const UploadOptionGroup: React.FC<{
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
}> = ({ label, options, selected, onToggle }) => (
    <section className="upload-option-group">
        <h3>{label}</h3>
        <div>
            {options.map((option) => (
                <button
                    className={selected.includes(option) ? 'active' : ''}
                    key={option}
                    onClick={() => onToggle(option)}
                >
                    {option}
                </button>
            ))}
        </div>
    </section>
);

const UploadPreview: React.FC<{
    file: UploadFileCard;
    uploaderLabel: string;
    geoOptions: string[];
    angleOptions: string[];
    onRemove: () => void;
    onToggleOverride: () => void;
    onToggleValue: (value: string, key: 'geos' | 'angles') => void;
    onUpdate: (fileId: string, changes: Partial<UploadFileCard>) => void;
}> = ({ file, uploaderLabel, geoOptions, angleOptions, onRemove, onToggleOverride, onToggleValue, onUpdate }) => (
    <article className="upload-file-card">
        <div className={`upload-file-preview tone-${file.tone}`}>
            <span className={`override-badge status-${file.uploadStatus}`}>
                {file.uploadStatus === 'idle'
                    ? file.override ? '✎ override' : 'ready'
                    : file.uploadStatus === 'uploading'
                        ? 'uploading'
                        : file.uploadStatus === 'duplicate'
                            ? 'duplicate'
                            : file.uploadStatus}
            </span>
            <ViewerWatermarks viewerLabel={uploaderLabel} count={4} />
        </div>
        <div>
            <strong>{file.name}</strong>
            <small>{file.shortId || file.error || file.size}</small>
            <div className="upload-file-actions">
                <button onClick={onToggleOverride}>{file.override ? 'прибрати override' : 'override'}</button>
                <button onClick={onRemove}>видалити</button>
            </div>
            {file.override && (
                <section className="file-override-panel">
                    <UploadOptionGroup
                        label="гео ·"
                        options={geoOptions}
                        selected={file.geos}
                        onToggle={(value) => onToggleValue(value, 'geos')}
                    />
                    <UploadOptionGroup
                        label="angle ·"
                        options={angleOptions}
                        selected={file.angles}
                        onToggle={(value) => onToggleValue(value, 'angles')}
                    />
                    <label className="preland-field">
                        <span>преленд</span>
                        <input
                            placeholder="override preland"
                            value={file.preland}
                            onChange={(event) => onUpdate(file.id, { preland: event.target.value })}
                        />
                    </label>
                    <label className="preland-field">
                        <span>коментар</span>
                        <input
                            placeholder="override comment"
                            value={file.authorComment}
                            onChange={(event) => onUpdate(file.id, { authorComment: event.target.value })}
                        />
                    </label>
                    <div className="version-fields">
                        <label className="preland-field">
                            <span>parent</span>
                            <input
                                placeholder="CR-A7F3K"
                                value={file.parentShortId}
                                onChange={(event) => onUpdate(file.id, { parentShortId: event.target.value.toUpperCase() })}
                            />
                        </label>
                        <label className="preland-field">
                            <span>версія</span>
                            <input
                                placeholder="v2"
                                value={file.versionLabel}
                                onChange={(event) => onUpdate(file.id, { versionLabel: event.target.value.toLowerCase() })}
                            />
                        </label>
                    </div>
                </section>
            )}
        </div>
    </article>
);

const feedIconFor = (type: string) => {
    if (type === 'comment') return '💬';
    if (type === 'download') return '📥';
    if (type === 'new_creative') return '🆕';
    if (type === 'status_change') return '📊';
    if (type === 'burnout') return '🔥';
    if (type === 'author_lifecycle_update') return '📝';
    if (type === 'archive_toggle') return '🗄';
    return 'ϟ';
};

const actorName = (item: FeedItem) => (
    item.username ? `@${item.username}` : item.display_name || 'система'
);

const renderFeedContent = (item: FeedItem) => {
    const shortId = item.short_id || item.payload?.shortId || item.payload?.creativeId || 'крео';

    if (item.type === 'comment') {
        return <><b>{actorName(item)}</b> прокоментував <strong>{shortId}</strong>: <i>"{item.payload?.text}"</i></>;
    }

    if (item.type === 'download') {
        return <><b>{actorName(item)}</b> скачав <strong>{shortId}</strong></>;
    }

    if (item.type === 'new_creative') {
        return <>нове крео <strong>{shortId}</strong> по підписці</>;
    }

    if (item.type === 'status_change') {
        return <><b>{actorName(item)}</b> поставив <em className="success">{statusText[item.payload?.new_status] || item.payload?.new_status}</em> на <strong>{shortId}</strong></>;
    }

    if (item.type === 'burnout') {
        return <>крео <strong>{shortId}</strong> позначено як <em>вигорає</em> ({item.payload?.negative_statuses_14d || 3}+ негативи за 14 днів)</>;
    }

    if (item.type === 'author_lifecycle_update') {
        const lifecycleText: Record<string, string> = {
            actual: 'актуальний',
            fading: 'вигорає',
            not_running: 'не лию',
        };
        return <><b>{actorName(item)}</b> оновив авторський статус <strong>{shortId}</strong>: <em>{lifecycleText[item.payload?.author_lifecycle_status] || item.payload?.author_lifecycle_status}</em></>;
    }

    return <><b>{actorName(item)}</b> оновив <strong>{shortId}</strong></>;
};

const humanizeKey = (value: string) => value.replace(/_/g, ' ');

const AdminScreen: React.FC<{
    dashboard: AdminDashboardData | null;
    analytics: AdminAnalyticsData | null;
    buyers: BuyerTrackRecord[];
    angles: AdminAngle[];
    settings: Record<string, number | boolean>;
    moderation: ModerationCreative[];
    moderationStatus: string;
    onModerationStatusChange: (status: string) => Promise<void>;
    onReload: () => Promise<void>;
}> = ({ dashboard, analytics, buyers, angles, settings, moderation, moderationStatus, onModerationStatusChange, onReload }) => {
    const [newAngle, setNewAngle] = useState('');
    const [draftSettings, setDraftSettings] = useState<Record<string, number | boolean>>(settings);
    const [exportDataset, setExportDataset] = useState('creatives');
    const maxWeekly = Math.max(1, ...(dashboard?.charts.weekly || []).flatMap((row) => [row.uploads, row.downloads]));

    useEffect(() => {
        setDraftSettings(settings);
    }, [settings]);

    const downloadExport = async (kind: 'csv' | 'xls') => {
        const response = await apiClient.get(`/api/admin/exports?dataset=${exportDataset}&format=${kind}`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${exportDataset}.${kind}`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const saveSettings = async () => {
        await apiClient.put('/api/admin/settings', draftSettings);
        await onReload();
    };

    const addAngle = async () => {
        const value = newAngle.trim();
        if (!value) return;
        await apiClient.post('/api/admin/angles', { value });
        setNewAngle('');
        await onReload();
    };

    const toggleAngle = async (angle: AdminAngle) => {
        await apiClient.put(`/api/admin/angles/${angle.id}`, { is_active: !angle.is_active });
        await onReload();
    };

    const moderate = async (creativeId: string, action: 'approve' | 'reject') => {
        await apiClient.post(`/api/admin/moderation/${creativeId}`, { action });
        await onReload();
    };

    return (
        <main className="app-shell admin-shell">
            <div className="noise" />
            <section className="admin-screen">
                <header className="broadcast">admin · dashboard</header>
                <div className="admin-heading">
                    <h1>адмін<span>.</span></h1>
                    <div className="admin-export-controls">
                        <select value={exportDataset} onChange={(event) => setExportDataset(event.target.value)}>
                            <option value="creatives">creatives</option>
                            <option value="buyers">buyers</option>
                            <option value="downloads">downloads</option>
                            <option value="activity">activity</option>
                            <option value="moderation">moderation</option>
                        </select>
                        <button onClick={() => void downloadExport('csv')}>CSV</button>
                        <button onClick={() => void downloadExport('xls')}>Excel</button>
                    </div>
                </div>

                <section className="admin-kpis">
	                    {Object.entries(dashboard?.summary || {}).map(([key, value]) => (
	                        <article key={key}>
	                            <strong>{value}</strong>
	                            <small>{humanizeKey(key)}</small>
	                        </article>
	                    ))}
                </section>

                <section className="admin-grid">
                    <AdminPanel title="14 днів">
                        <div className="admin-bars">
                            {(dashboard?.charts.weekly || []).map((row) => (
                                <div key={row.label}>
                                    <span>{row.label.slice(5)}</span>
                                    <i style={{ height: `${Math.max(6, (row.uploads / maxWeekly) * 100)}%` }} />
                                    <b style={{ height: `${Math.max(6, (row.downloads / maxWeekly) * 100)}%` }} />
                                </div>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="статуси">
                        <AdminList rows={dashboard?.charts.statuses || []} />
                    </AdminPanel>

                    <AdminPanel title="ROI">
                        <AdminList rows={analytics?.roi || []} />
                    </AdminPanel>

                    <AdminPanel title="lifecycle">
                        <AdminList rows={analytics?.lifecycle || []} />
                    </AdminPanel>

                    <AdminPanel title="архів">
                        <div className="admin-list">
                            {(analytics?.archive || []).map((row) => (
                                <article key={row.label}>
                                    <span>{row.label}</span>
                                    <strong>{row.archived}/{row.value}</strong>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="angles">
                        <div className="admin-inline-form">
                            <input value={newAngle} onChange={(event) => setNewAngle(event.target.value)} placeholder="new angle" />
                            <button onClick={() => void addAngle()}>+</button>
                        </div>
                        <div className="admin-list">
                            {angles.map((angle) => (
                                <article key={angle.id}>
                                    <span>{angle.value}</span>
                                    <button className={angle.is_active ? 'active' : ''} onClick={() => void toggleAngle(angle)}>
                                        {angle.is_active ? 'on' : 'off'}
                                    </button>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="thresholds">
                        <div className="admin-settings">
	                            {Object.entries(draftSettings).map(([key, value]) => (
	                                <label key={key}>
	                                    <span>{humanizeKey(key)}</span>
                                    {typeof value === 'boolean' ? (
                                        <button
                                            className={value ? 'active' : ''}
                                            onClick={() => setDraftSettings((current) => ({
                                                ...current,
                                                [key]: !value,
                                            }))}
                                        >
                                            {value ? 'on' : 'off'}
                                        </button>
                                    ) : (
                                        <input
                                            type="number"
                                            value={value}
                                            onChange={(event) => setDraftSettings((current) => ({
                                                ...current,
                                                [key]: Number(event.target.value),
                                            }))}
                                        />
                                    )}
                                </label>
                            ))}
                            <button onClick={() => void saveSettings()}>зберегти</button>
                        </div>
                    </AdminPanel>
                </section>

                <AdminUsersPanel />

                <section className="admin-grid admin-wide-grid">
                    <AdminPanel title="track record баєрів">
                        <div className="buyer-record-list">
                            {buyers.length === 0 && <p className="state-message">даних по баєрах поки немає</p>}
                            {buyers.map((buyer) => (
                                <article key={buyer.id}>
                                    <div>
                                        <strong>@{buyer.username || buyer.display_name || 'buyer'}</strong>
                                        <small>{buyer.uploads} залив · {buyer.creatives_tested} тестів · {buyer.comments} коментів · {buyer.downloads} скачувань</small>
                                    </div>
                                    <span>{buyer.prediction_accuracy}% accuracy</span>
                                    <span>{buyer.working_confirmed_by_others} підтвердж.</span>
                                    <span>{buyer.green}/{buyer.yellow}/{buyer.red}</span>
                                    <b className={buyer.overdue_downloads > 0 ? 'warn' : ''}>{buyer.overdue_downloads} overdue</b>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="аналітика geo">
                        <div className="geo-performance-list">
                            {(analytics?.geos || []).map((geo) => (
                                <article key={geo.label}>
                                    <strong>{geo.label}</strong>
                                    <span>{geo.creatives} крео</span>
                                    <span>{geo.downloads} dl</span>
                                    <span>{geo.green} green</span>
                                    <span>{geo.hot_score} hot</span>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="активність баєрів">
                        <div className="buyer-activity-list">
                            {(analytics?.buyerActivity || []).slice(0, 10).map((row) => (
                                <article key={row.id}>
                                    <strong>@{row.buyer}</strong>
                                    <span>{row.uploads} залив</span>
                                    <span>{row.tests} тестів</span>
                                    <span>{row.comments} ком.</span>
                                    <small>7д: {row.uploads_week}/{row.tests_week}/{row.comments_week}</small>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="30 днів">
                        <div className="month-dynamics">
                            {(analytics?.monthDynamics || []).map((row) => (
                                <article key={row.label}>
                                    <span>{row.label.slice(5)}</span>
                                    <b>{row.uploads}</b>
                                    <i>{row.tests}</i>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>

                    <AdminPanel title="модерація SLA">
                        <div className="admin-list">
                            <article>
                                <span>pending</span>
                                <strong>{analytics?.moderationSla?.pending || 0}</strong>
                            </article>
                            <article>
                                <span>avg hours</span>
                                <strong>{analytics?.moderationSla?.avg_hours || 0}</strong>
                            </article>
                        </div>
                    </AdminPanel>

                    <AdminPanel title="reviewers">
                        <div className="reviewer-list">
                            {(analytics?.reviewers || []).map((reviewer) => (
                                <article key={reviewer.label}>
                                    <span>{reviewer.label}</span>
                                    <strong>{reviewer.reviewed}</strong>
                                    <small>{reviewer.approved} ok · {reviewer.rejected} reject</small>
                                </article>
                            ))}
                        </div>
                    </AdminPanel>
                </section>

                <section className="admin-panel moderation-panel">
                    <div className="moderation-heading">
                        <h2>модерація заливок</h2>
                        <div>
                            {['pending_review', 'approved', 'rejected'].map((status) => (
                                <button
                                    key={status}
                                    className={moderationStatus === status ? 'active' : ''}
                                    onClick={() => void onModerationStatusChange(status)}
                                >
                                    {humanizeKey(status)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="moderation-list">
                        {moderation.length === 0 && <p className="state-message">черга порожня</p>}
                        {moderation.map((creative) => (
                            <article key={creative.id}>
                                <div>
                                    <strong>{creative.short_id}</strong>
                                    <small>{creative.geos.filter(Boolean).join(' · ') || 'geo'} · {creative.angles.filter(Boolean).join(' · ') || 'angle'} · @{creative.author_username || creative.author_display_name || 'author'}</small>
                                </div>
                                <button onClick={() => void moderate(creative.id, 'approve')}>approve</button>
                                <button onClick={() => void moderate(creative.id, 'reject')}>reject</button>
                            </article>
                        ))}
                    </div>
                </section>
            </section>
        </main>
    );
};

const AdminPanel: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => (
    <section className="admin-panel">
        <h2>{title}</h2>
        {children}
    </section>
);

const AdminList: React.FC<{ rows: Array<{ label: string; value: number }> }> = ({ rows }) => (
    <div className="admin-list">
        {rows.map((row) => (
            <article key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
            </article>
        ))}
    </div>
);

export const App: React.FC = () => {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    const initialParams = new URLSearchParams(window.location.search);
    const initialUploadSessionId = initialParams.get('uploadSession');
    const [creatives, setCreatives] = useState<CreativeCard[]>([]);
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [bookmarkCreatives, setBookmarkCreatives] = useState<CreativeCard[]>([]);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [total, setTotal] = useState(0);
    const [query, setQuery] = useState('');
    const [activeGeo, setActiveGeo] = useState<string | null>(null);
    const [activeAngle, setActiveAngle] = useState<string | null>(null);
    const [activeStatus, setActiveStatus] = useState<CreativeStatus | null>(null);
    const [sortMode, setSortMode] = useState<SortMode>('newest');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [archiveMode, setArchiveMode] = useState(false);
    const [activeScreen, setActiveScreen] = useState<AppScreen>(initialParams.get('screen') === 'upload' ? 'upload' : 'catalog');
    const [telegramUploadSessionId, setTelegramUploadSessionId] = useState<string | null>(initialUploadSessionId);
    const [selectedCreative, setSelectedCreative] = useState<CreativeCard | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(true);
    const [adminDashboard, setAdminDashboard] = useState<AdminDashboardData | null>(null);
    const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsData | null>(null);
    const [buyerTrackRecords, setBuyerTrackRecords] = useState<BuyerTrackRecord[]>([]);
    const [adminAngles, setAdminAngles] = useState<AdminAngle[]>([]);
    const [adminSettings, setAdminSettings] = useState<Record<string, number | boolean>>({});
    const [moderationCreatives, setModerationCreatives] = useState<ModerationCreative[]>([]);
    const [adminModerationStatus, setAdminModerationStatus] = useState('pending_review');
    const [referenceLists, setReferenceLists] = useState({
        geos: defaultGeos,
        angles: defaultAngles,
        languages: [] as string[],
    });
    const [topWeekCreatives, setTopWeekCreatives] = useState<CreativeCard[]>([]);

    const loadAppData = async (
        nextArchiveMode = archiveMode,
        nextSort = sortMode,
        nextQuery = query,
        nextGeo = activeGeo,
        nextAngle = activeAngle,
        nextStatus = activeStatus,
    ) => {
        const catalogParams = new URLSearchParams();
        if (nextArchiveMode) {
            catalogParams.set('archived', 'true');
        }
        if (nextGeo) {
            catalogParams.set('geos', nextGeo);
        }
        if (nextAngle) {
            catalogParams.set('angles', nextAngle);
        }
        if (nextStatus) {
            catalogParams.set('status', nextStatus);
        }
        catalogParams.set('sort', nextSort);
        if (nextQuery.trim()) {
            catalogParams.set('q', nextQuery.trim());
        }

        const [catalogResponse, activityResponse, bookmarksResponse, profileResponse, referenceResponse, topWeekResponse] = await Promise.all([
            apiClient.get(`/api/creatives?${catalogParams.toString()}`),
            apiClient.get('/api/app/activity/week'),
            apiClient.get('/api/app/bookmarks'),
            apiClient.get('/api/app/profile'),
            apiClient.get('/api/app/reference'),
            apiClient.get('/api/app/top/week'),
        ]);
        const bookmarks = bookmarksResponse.data.data.map(normalizeCreative);
        const bookmarkIds = new Set(bookmarks.map((creative: CreativeCard) => creative.id));
        const loaded = catalogResponse.data.data.map((item: Record<string, any>, index: number) => ({
            ...normalizeCreative(item, index),
            bookmarked: bookmarkIds.has(item.id),
        }));

        setCreatives(loaded);
        setFeedItems(activityResponse.data.data);
        setBookmarkCreatives(bookmarks.map((creative: CreativeCard) => ({ ...creative, bookmarked: true })));
        setProfile(profileResponse.data.data);
        setTotal(catalogResponse.data.pagination.total);
        setReferenceLists(referenceResponse.data.data);
        setTopWeekCreatives(topWeekResponse.data.data.map((item: Record<string, any>, index: number) => normalizeCreative(item, index)));
    };

    const loadAdminData = async (moderationStatus = adminModerationStatus) => {
        const [dashboardResponse, analyticsResponse, buyersResponse, anglesResponse, settingsResponse, moderationResponse] = await Promise.all([
            apiClient.get('/api/admin/dashboard'),
            apiClient.get('/api/admin/analytics'),
            apiClient.get('/api/admin/buyers/track-record'),
            apiClient.get('/api/admin/angles'),
            apiClient.get('/api/admin/settings'),
            apiClient.get(`/api/admin/moderation?status=${moderationStatus}`),
        ]);

        setAdminDashboard(dashboardResponse.data.data);
        setAdminAnalytics(analyticsResponse.data.data);
        setBuyerTrackRecords(buyersResponse.data.data);
        setAdminAngles(anglesResponse.data.data);
        setAdminSettings(settingsResponse.data.data);
        setModerationCreatives(moderationResponse.data.data);
    };

    const changeAdminModerationStatus = async (status: string) => {
        setAdminModerationStatus(status);
        await loadAdminData(status);
    };

    useEffect(() => {
        const loadCatalog = async () => {
            const webApp = window.Telegram?.WebApp;
            webApp?.expand();
            webApp?.ready();
            const startParam = webApp?.initDataUnsafe?.start_param || '';
            if (!telegramUploadSessionId && startParam.startsWith('uploadSession_')) {
                setTelegramUploadSessionId(startParam.replace('uploadSession_', ''));
                setActiveScreen('upload');
            }

            if (!webApp?.initData) {
                setIsTelegramMiniApp(false);
                setLoading(false);
                return;
            }

            try {
                const authResponse = await apiClient.post('/api/auth/verify', { initData: webApp.initData });
                localStorage.setItem('creative_bot_token', authResponse.data.token);
                if (isAdminPath) {
                    await loadAdminData();
                } else {
                    await loadAppData();
                }
            } catch (requestError: any) {
                setError(requestError.response?.data?.error || 'Не вдалося завантажити каталог');
            } finally {
                setLoading(false);
            }
        };

        loadCatalog();
    }, []);

    const toggleBookmark = async (creative: CreativeCard) => {
        if (creative.bookmarked) {
            await apiClient.delete(`/api/app/bookmarks/${creative.id}`);
        } else {
            await apiClient.post(`/api/app/bookmarks/${creative.id}`);
        }

        const nextBookmarked = !creative.bookmarked;
        const updateCreative = (item: CreativeCard) => (
            item.id === creative.id ? { ...item, bookmarked: nextBookmarked } : item
        );

        setCreatives((current) => current.map(updateCreative));
        setBookmarkCreatives((current) => (
            nextBookmarked
                ? [{ ...creative, bookmarked: true }, ...current]
                : current.filter((item) => item.id !== creative.id)
        ));
        setSelectedCreative((current) => (current?.id === creative.id ? { ...current, bookmarked: nextBookmarked } : current));
    };

    const toggleArchiveMode = async () => {
        const nextArchiveMode = !archiveMode;
        setArchiveMode(nextArchiveMode);
        setSelectedCreative(null);
        setLoading(true);
        setError(null);

        try {
            await loadAppData(nextArchiveMode);
        } catch (requestError: any) {
            setError(requestError.response?.data?.error || 'Не вдалося завантажити каталог');
        } finally {
            setLoading(false);
        }
    };

    const resurrectCreative = async (creative: CreativeCard) => {
        await apiClient.post(`/api/status/${creative.id}/resurrect`, {
            geoCode: creative.geos[0],
        });
        setSelectedCreative(null);
        await loadAppData(archiveMode);
    };

    const updateCreativeLifecycle = async (
        creative: CreativeCard,
        lifecycleStatus: 'actual' | 'fading' | 'not_running'
    ) => {
        const response = await apiClient.post(`/api/creatives/${creative.id}/lifecycle`, { status: lifecycleStatus });
        const updatedStatus = response.data.data.aggregated_status as CreativeStatus;
        const updatedLifecycleAt = response.data.data.author_lifecycle_updated_at;
        const updateCreative = (item: CreativeCard) => (
            item.id === creative.id
                ? {
                    ...item,
                    status: updatedStatus,
                    authorLifecycleStatus: lifecycleStatus,
                    authorLifecycleUpdatedAt: updatedLifecycleAt,
                }
                : item
        );

        setCreatives((current) => current.map(updateCreative));
        setBookmarkCreatives((current) => current.map(updateCreative));
        setSelectedCreative((current) => (current?.id === creative.id ? updateCreative(current) : current));
    };

    const updateCommentCount = (creativeId: string) => {
        const updateCreative = (item: CreativeCard) => (
            item.id === creativeId ? { ...item, commentCount: item.commentCount + 1 } : item
        );

        setCreatives((current) => current.map(updateCreative));
        setBookmarkCreatives((current) => current.map(updateCreative));
        setSelectedCreative((current) => (current?.id === creativeId ? updateCreative(current) : current));
    };

    const removeSubscription = async (subscriptionId: string) => {
        await apiClient.delete(`/api/app/subscriptions/${subscriptionId}`);
        setProfile((current) => current && {
            ...current,
            subscriptions: current.subscriptions.filter((subscription) => subscription.id !== subscriptionId),
        });
    };

    const addSubscription = async () => {
        const response = await apiClient.post('/api/app/subscriptions', { geoCode: activeGeo || 'DE', angle: activeAngle || null });
        setProfile((current) => current && {
            ...current,
            subscriptions: [response.data.data, ...current.subscriptions],
        });
    };

    const toggleNotificationSetting = async (type: string) => {
        const currentValue = profile?.notificationSettings[type] ?? true;
        const nextValue = !currentValue;

        setProfile((current) => current && {
            ...current,
            notificationSettings: {
                ...current.notificationSettings,
                [type]: nextValue,
            },
        });

        try {
            await apiClient.patch(`/api/app/notification-settings/${type}`, { isEnabled: nextValue });
        } catch (requestError) {
            setProfile((current) => current && {
                ...current,
                notificationSettings: {
                    ...current.notificationSettings,
                    [type]: currentValue,
                },
            });
            throw requestError;
        }
    };

    useEffect(() => {
        if (!selectedCreative) {
            return;
        }

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedCreative(null);
            }
        };

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [selectedCreative]);

    const viewerLabel = profile?.user.username
        ? `@${profile.user.username}`
        : profile?.user.displayName || 'невідомо';

    const visibleCreatives = creatives;

    useEffect(() => {
        if (!profile) {
            return;
        }

        const reload = setTimeout(() => {
            void loadAppData(archiveMode, sortMode, query, activeGeo, activeAngle, activeStatus);
        }, 300);

        return () => clearTimeout(reload);
    }, [sortMode, query, activeGeo, activeAngle, activeStatus, archiveMode, profile?.user.id]);

    if (!isTelegramMiniApp) {
        return (
            <main className="telegram-only">
                <div className="noise" />
                <section>
                    <h1>каталог<span>.</span></h1>
                    <p>цей застосунок відкривається лише всередині telegram</p>
                    <small>поверніться до бота та натисніть кнопку «відкрити каталог»</small>
                </section>
            </main>
        );
    }

    if (isAdminPath) {
        if (loading) {
            return <main className="app-shell"><p className="state-message">завантаження адмінки...</p></main>;
        }

        if (error) {
            return (
                <main className="app-shell">
                    <p className="state-message">{error}</p>
                </main>
            );
        }

        return (
            <AdminScreen
                dashboard={adminDashboard}
                analytics={adminAnalytics}
                buyers={buyerTrackRecords}
                angles={adminAngles}
                settings={adminSettings}
                moderation={moderationCreatives}
                moderationStatus={adminModerationStatus}
                onModerationStatusChange={changeAdminModerationStatus}
                onReload={loadAdminData}
            />
        );
    }

    if (activeScreen === 'feed') {
        return (
            <main className="app-shell">
                <div className="noise" />
                <section className="feed">
                    <header className="broadcast">mini app · живі дані API</header>
                    <div className="feed-heading">
                        <h1>стрічка<span>.</span></h1>
                        <p>що сталось у команді</p>
                    </div>
                    <section className="feed-list">
                        {feedItems.length === 0 && <p className="state-message">активності поки немає</p>}
                        {feedItems.map((item) => (
                            <article className="feed-item" key={item.id}>
                                <span className="feed-icon">{feedIconFor(item.type)}</span>
                                <div>
                                    <p>{renderFeedContent(item)}</p>
                                    <small>{relativeDate(item.created_at)}</small>
                                </div>
                            </article>
                        ))}
                    </section>
                </section>
                <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
            </main>
        );
    }

    if (activeScreen === 'bookmarks') {
        return (
            <main className="app-shell">
                <div className="noise" />
                <section className="bookmarks">
                    <header className="broadcast">mini app · живі дані API</header>
                    <div className="bookmarks-heading">
                        <h1>закладки<span>.</span></h1>
                        <p>хочу спробувати · {bookmarkCreatives.length}</p>
                    </div>
                    <section className="creative-grid bookmark-grid">
                        {bookmarkCreatives.length === 0 && <p className="state-message">закладок поки немає</p>}
                        {bookmarkCreatives.map((creative) => (
                            <BookmarkPreview
                                creative={creative}
                                key={creative.id}
                                viewerLabel={viewerLabel}
                                onOpen={setSelectedCreative}
                            />
                        ))}
                    </section>
                </section>
                <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
                {selectedCreative && (
		                    <CreativeDetailsModal
		                        creative={selectedCreative}
		                        currentUser={profile?.user}
		                        onClose={() => setSelectedCreative(null)}
		                        onBookmarkToggle={toggleBookmark}
		                        onCommentAdded={updateCommentCount}
		                        onResurrect={resurrectCreative}
		                        onLifecycleUpdate={updateCreativeLifecycle}
		                    />
                )}
            </main>
        );
    }

    if (activeScreen === 'upload') {
        return (
            <main className="app-shell">
                <div className="noise" />
                <UploadScreen
                    presets={profile?.presets || []}
                    uploaderLabel={viewerLabel}
                    geoOptions={referenceLists.geos}
                    angleOptions={referenceLists.angles}
                    languageOptions={referenceLists.languages}
                    telegramUploadSessionId={telegramUploadSessionId}
                    onUploaded={loadAppData}
                />
                <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
            </main>
        );
    }

    if (activeScreen === 'profile') {
        return (
            <main className="app-shell">
                <div className="noise" />
                <section className="profile">
                    <header className="broadcast">mini app · живі дані API</header>
                    <div className="profile-heading">
                        <h1>профіль<span>.</span></h1>
                    </div>
                    <section className="profile-content">
                        <article className="profile-card">
                            <h2>{profile?.user.username ? `@${profile.user.username}` : profile?.user.displayName || 'профіль'}</h2>
                            <p>{profile?.user.role || 'buyer'} · у команді з {profile?.user.createdAt ? relativeDate(profile.user.createdAt) : 'н/д'}</p>
                            <div className="profile-stats">
                                <div><strong>{profile?.stats.uploads ?? 0}</strong><small>залив</small></div>
                                <div><strong>{profile?.stats.tests ?? 0}</strong><small>тестую</small></div>
                                <div><strong>{profile?.stats.accuracy ?? 0}%</strong><small>точність</small></div>
                            </div>
                        </article>

                        <ProfileSection title="підписки">
                            {(profile?.subscriptions || []).map((subscription) => (
                                <article className="profile-row" key={subscription.id}>
                                    <p><strong>{subscription.geo_code || 'будь-яке GEO'}</strong> · {subscription.angle || 'any'}</p>
                                    <button
                                        onClick={() => void removeSubscription(subscription.id)}
                                    >
                                        видалити
                                    </button>
                                </article>
                            ))}
                            {(profile?.subscriptions || []).length === 0 && <p className="state-message">підписок поки немає</p>}
                            <button className="add-subscription" onClick={() => void addSubscription()}>+ нова підписка</button>
                        </ProfileSection>

                        <ProfileSection title="пресети заливки">
                            {(profile?.presets || []).map((preset) => (
                                <article className="preset-row" key={preset.id}>
                                    <strong>{preset.name}</strong>
                                    <small>{preset.geo_codes.join(', ') || 'GEO н/д'} · {preset.angles.join(', ') || 'angle н/д'}</small>
                                </article>
                            ))}
                            {(profile?.presets || []).length === 0 && <p className="state-message">пресетів поки немає</p>}
                        </ProfileSection>

                        <ProfileSection title="сповіщення">
                            {notificationOptions.map((option) => (
                                <article className="notification-row" key={option.type}>
                                    <span>{option.label}</span>
                                    <button
                                        aria-label={`Перемкнути: ${option.label}`}
                                        className={`toggle ${profile?.notificationSettings[option.type] ?? true ? 'active' : ''}`}
                                        onClick={() => void toggleNotificationSetting(option.type)}
                                    >
                                        <i />
                                    </button>
                                </article>
                            ))}
                        </ProfileSection>
                    </section>
                </section>
                <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
            </main>
        );
    }

    return (
        <main className="app-shell">
            <div className="noise" />
            <section className="catalog">
                <header className="broadcast">mini app · живі дані API</header>
	                <div className="catalog-toolbar">
	                    <div className="heading-line">
	                        <h1>каталог<span>.</span></h1>
	                        <small>{archiveMode ? `${total} в архіві` : `${total} крео`}</small>
	                    </div>
                    <div className="search-line">
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="ID, angle, автор..."
                            aria-label="Пошук креативів"
                        />
	                        <button
	                            className={filtersOpen ? 'active' : ''}
	                            onClick={() => setFiltersOpen((current) => !current)}
	                        >
	                            фільтр
	                        </button>
	                        <button
	                            className={archiveMode ? 'active' : ''}
	                            onClick={() => void toggleArchiveMode()}
	                        >
	                            архів
	                        </button>
	                    </div>
                    {filtersOpen && (
                        <div className="filter-panel">
                            <FilterGroup
                                label="гео"
                                options={referenceLists.geos}
                                activeOption={activeGeo}
                                onSelect={setActiveGeo}
                            />
                            <FilterGroup
                                label="angle"
                                options={referenceLists.angles}
                                activeOption={activeAngle}
                                onSelect={setActiveAngle}
                            />
                            <FilterGroup
                                label="статус"
                                options={statusFilters}
                                activeOption={activeStatus}
                                onSelect={setActiveStatus}
                            />
                            <div className="sort-row">
                                <span>сорт:</span>
                                <button
                                    className={sortMode === 'newest' ? 'active' : ''}
                                    onClick={() => setSortMode('newest')}
                                >
                                    найновіші
                                </button>
                                <button
                                    className={sortMode === 'confirmations' ? 'active' : ''}
                                    onClick={() => setSortMode('confirmations')}
                                >
                                    підтвердження
                                </button>
                                <button
                                    className={sortMode === 'updated' ? 'active' : ''}
                                    onClick={() => setSortMode('updated')}
                                >
                                    оновлення
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {topWeekCreatives.length > 0 && !archiveMode && (
                    <section className="top-week-strip">
                        <h2>топ тижня</h2>
                        <div className="creative-grid compact">
                            {topWeekCreatives.slice(0, 6).map((creative) => (
                                <CreativePreview
                                    creative={creative}
                                    key={`top-${creative.id}`}
                                    viewerLabel={viewerLabel}
                                    onOpen={setSelectedCreative}
                                />
                            ))}
                        </div>
                    </section>
                )}

                <section className="creative-grid" aria-live="polite">
                    {loading && <p className="state-message">завантаження каталогу...</p>}
                    {error && <p className="state-message error">{error}</p>}
                    {!loading && !error && visibleCreatives.length === 0 && (
                        <p className="state-message">нічого не знайдено</p>
                    )}
                    {visibleCreatives.map((creative) => (
                        <CreativePreview
                            creative={creative}
                            key={creative.id}
                            viewerLabel={viewerLabel}
                            onOpen={setSelectedCreative}
                        />
                    ))}
                </section>
            </section>

            <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
	            {selectedCreative && (
		                <CreativeDetailsModal
		                    creative={selectedCreative}
		                    currentUser={profile?.user}
		                    onClose={() => setSelectedCreative(null)}
		                    onBookmarkToggle={toggleBookmark}
		                    onCommentAdded={updateCommentCount}
		                    onResurrect={resurrectCreative}
		                    onLifecycleUpdate={updateCreativeLifecycle}
		                />
	            )}
        </main>
    );
};
