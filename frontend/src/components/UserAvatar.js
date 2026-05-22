import React, { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Loads the authenticated user's avatar blob (requires session). Falls back to initials.
 */
export default function UserAvatar({ userId, label, size = 32, className = '', rev = 0 }) {
    const [src, setSrc] = useState(null);

    useEffect(() => {
        if (!userId) {
            setSrc(null);
            return undefined;
        }
        let objectUrl;
        let cancelled = false;
        (async () => {
            try {
                const res = await api.get(`/auth/avatar/${userId}`, {
                    responseType: 'blob',
                    params: rev ? { _: rev } : undefined,
                });
                if (cancelled) return;
                if (!res.data || res.data.size === 0) {
                    setSrc(null);
                    return;
                }
                objectUrl = URL.createObjectURL(res.data);
                setSrc(objectUrl);
            } catch {
                if (!cancelled) setSrc(null);
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [userId, rev]);

    const initial = (label || '?').slice(0, 1).toUpperCase();

    if (src) {
        return (
            <img
                src={src}
                alt=""
                className={`user-avatar-img ${className}`}
                width={size}
                height={size}
                style={{ borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle' }}
            />
        );
    }

    return (
        <span
            className={`user-avatar-fallback ${className}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6b8cff, #a78bfa)',
                color: '#fff',
                fontSize: Math.max(12, size * 0.4),
                fontWeight: 700,
                verticalAlign: 'middle',
            }}
            aria-hidden
        >
            {initial}
        </span>
    );
}
