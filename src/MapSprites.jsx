import React from 'react';

export function LandmarkSprite({ type, size = 96 }) {
    if (type === 'market') {
        return (
            <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
                <ellipse cx="60" cy="98" rx="32" ry="10" fill="rgba(0,0,0,0.18)" />
                <rect x="38" y="54" width="44" height="28" rx="8" fill="#ff9f5b" />
                <rect x="34" y="38" width="52" height="20" rx="10" fill="#fff2d8" />
                <path d="M34 38h52l-6 18H40z" fill="#ef5350" />
                <path d="M48 38h8l-4 18h-8zM64 38h8l-4 18h-8z" fill="#fff6de" />
                <rect x="50" y="60" width="12" height="18" rx="5" fill="#ffe3b0" />
                <rect x="36" y="80" width="48" height="8" rx="4" fill="#7c4c22" />
            </svg>
        );
    }

    if (type === 'forge') {
        return (
            <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
                <ellipse cx="60" cy="100" rx="32" ry="10" fill="rgba(0,0,0,0.18)" />
                <circle cx="60" cy="56" r="20" fill="none" stroke="#9c7bff" strokeWidth="10" />
                <circle cx="60" cy="56" r="10" fill="#5de2ff" />
                <rect x="46" y="66" width="28" height="22" rx="8" fill="#2e3369" />
                <rect x="38" y="84" width="44" height="9" rx="4.5" fill="#6e48c8" />
                <circle cx="42" cy="56" r="4" fill="#ffd166" />
                <circle cx="78" cy="56" r="4" fill="#ff7aa2" />
            </svg>
        );
    }

    if (type === 'fountain') {
        return (
            <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
                <ellipse cx="60" cy="100" rx="30" ry="10" fill="rgba(0,0,0,0.18)" />
                <ellipse cx="60" cy="84" rx="24" ry="12" fill="#f2e7c1" />
                <ellipse cx="60" cy="84" rx="16" ry="8" fill="#52c7ff" />
                <rect x="54" y="48" width="12" height="26" rx="6" fill="#d9f4ff" />
                <path d="M60 32c6 7 10 15 10 22 0 6-4 11-10 11s-10-5-10-11c0-7 4-15 10-22z" fill="#7ce5ff" />
                <path d="M44 72c6-4 11-5 16-5s10 1 16 5" stroke="#a5f0ff" strokeWidth="5" strokeLinecap="round" fill="none" />
            </svg>
        );
    }

    if (type === 'tower') {
        return (
            <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
                <ellipse cx="60" cy="102" rx="28" ry="9" fill="rgba(0,0,0,0.18)" />
                <rect x="44" y="48" width="32" height="38" rx="10" fill="#4d3a7f" />
                <rect x="50" y="28" width="20" height="26" rx="8" fill="#f8d06a" />
                <path d="M60 16l12 16H48z" fill="#ff955f" />
                <circle cx="60" cy="40" r="7" fill="#60d7ff" />
                <rect x="38" y="84" width="44" height="9" rx="4.5" fill="#7157b8" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
            <ellipse cx="60" cy="104" rx="36" ry="12" fill="rgba(0,0,0,0.18)" />
            <path d="M34 74c0-18 12-30 26-34 2-11 12-18 23-14 10 3 16 13 15 24 10 7 14 18 10 28H34z" fill="#78c850" />
            <path d="M47 85V70h10v15M63 85V68h11v17" stroke="#6f4d2f" strokeWidth="8" strokeLinecap="round" />
        </svg>
    );
}

export function HutSprite({ size = 190 }) {
    return (
        <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden="true">
            <ellipse cx="110" cy="180" rx="76" ry="24" fill="rgba(0,0,0,0.18)" />
            <path d="M52 94L110 52l58 42-20 10H72z" fill="#ff8a5c" />
            <path d="M68 104h84v58H68z" fill="#7b4e34" />
            <path d="M74 112h72v42H74z" fill="#8d5a3d" />
            <rect x="96" y="122" width="28" height="32" rx="8" fill="#2a1d1a" />
            <rect x="82" y="122" width="11" height="16" rx="4" fill="#73e7ff" />
            <rect x="127" y="122" width="11" height="16" rx="4" fill="#9af18a" />
            <path d="M88 68h44l34 26H54z" fill="#e1564f" />
            <rect x="102" y="70" width="16" height="18" rx="5" fill="#3d2b2d" />
            <rect x="79" y="154" width="62" height="12" rx="6" fill="#5a392b" />
            <circle cx="146" cy="124" r="4" fill="#ffd166" />
            <path d="M162 110l14 8v22l-14-8z" fill="#5d7cff" opacity="0.65" />
        </svg>
    );
}

export function LionScoutSprite({ size = 108 }) {
    return (
        <svg viewBox="0 0 150 180" width={size} height={size * 1.14} aria-hidden="true">
            <ellipse cx="78" cy="164" rx="32" ry="10" fill="rgba(0,0,0,0.18)" />
            <path d="M70 148c0 10-8 18-18 18-10 0-18-8-18-18s8-18 18-18c10 0 18 8 18 18z" fill="#1f2636" />
            <path d="M120 148c0 10-8 18-18 18-10 0-18-8-18-18s8-18 18-18c10 0 18 8 18 18z" fill="#1f2636" />
            <path d="M54 82c0-22 14-34 33-34s33 12 33 34v46H54z" fill="#1c2432" />
            <rect x="60" y="90" width="18" height="14" rx="4" fill="#b24cff" />
            <rect x="92" y="88" width="20" height="16" rx="4" fill="#45d6ff" />
            <path d="M56 88l-10 38M118 88l10 38" stroke="#1c2432" strokeWidth="14" strokeLinecap="round" />
            <path d="M70 126l-6 28M100 126l8 28" stroke="#1c2432" strokeWidth="16" strokeLinecap="round" />
            <path d="M58 34c0-18 14-32 32-32 18 0 32 14 32 32 0 4-1 9-2 13H60c-1-4-2-9-2-13z" fill="#8d4928" />
            <path d="M48 46c0-24 18-42 42-42s42 18 42 42c0 10-4 18-10 25H58c-6-7-10-15-10-25z" fill="#c46c2f" />
            <path d="M66 38c0-11 10-20 22-20s22 9 22 20v16H66z" fill="#f4c36a" />
            <path d="M68 44c0-11 9-20 20-20 11 0 20 9 20 20 0 16-8 28-20 28-12 0-20-12-20-28z" fill="#f6d28a" />
            <path d="M75 44c2-5 7-7 12-7 7 0 12 4 14 11l-1 2-4-2c-6-3-13-3-18 1l-4 3z" fill="#7b3d24" />
            <circle cx="81" cy="47" r="3.2" fill="#23160f" />
            <circle cx="101" cy="47" r="3.2" fill="#23160f" />
            <path d="M92 49l4 5-4 4-4-4z" fill="#5b2d23" />
            <path d="M84 61c5 3 11 3 16 0" stroke="#5b2d23" strokeWidth="3" strokeLinecap="round" />
            <path d="M123 103c9 5 13 16 9 24-4 9-14 11-22 9" stroke="#c78553" strokeWidth="5" strokeLinecap="round" fill="none" />
            <circle cx="131" cy="132" r="7" fill="#8d5a3d" />
            <path d="M47 118c6-2 10-8 11-14" stroke="#f6d28a" strokeWidth="8" strokeLinecap="round" />
            <path d="M126 116c-6-2-10-8-11-14" stroke="#f6d28a" strokeWidth="8" strokeLinecap="round" />
            <path d="M61 148h16M92 148h16" stroke="#75e4ff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
        </svg>
    );
}
