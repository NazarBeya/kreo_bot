import React, { useEffect, useState } from 'react';
import apiClient from '../api';

export const WatermarkedPreviewImage: React.FC<{
    creativeId: string;
    className?: string;
}> = ({ creativeId, className }) => {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;

        const loadPreview = async () => {
            try {
                const response = await apiClient.get(`/api/creatives/${creativeId}/preview`, {
                    responseType: 'blob',
                });

                if (cancelled) {
                    return;
                }

                objectUrl = URL.createObjectURL(response.data);
                setSrc(objectUrl);
            } catch {
                if (!cancelled) {
                    setSrc(null);
                }
            }
        };

        void loadPreview();

        return () => {
            cancelled = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [creativeId]);

    if (!src) {
        return null;
    }

    return <img className={className} src={src} alt="" />;
};
