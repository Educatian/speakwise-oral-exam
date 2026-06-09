/**
 * Constructive Score Display Utilities
 * 
 * Transforms numeric scores into encouraging, growth-oriented feedback.
 * Avoids punitive letter grades (F, D) in favor of mastery levels.
 */

export interface MasteryLevel {
    level: string;
    label: string;
    /** @deprecated Kept for backward compatibility; intentionally empty to
     *  preserve the restrained academic tone (no emoji grades). */
    emoji: string;
    color: string;      // Tailwind text color class
    bgColor: string;    // Tailwind background color class
    description: string;
}

/**
 * Get mastery level from score (0-100)
 * Uses growth-oriented language instead of traditional grades
 */
export function getMasteryLevel(score: number): MasteryLevel {
    if (score >= 90) {
        return {
            level: 'Expert',
            label: 'Excellent',
            emoji: '',
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/20',
            description: 'Outstanding demonstration of understanding'
        };
    }
    if (score >= 80) {
        return {
            level: 'Proficient',
            label: 'Great Work',
            emoji: '',
            color: 'text-green-400',
            bgColor: 'bg-green-500/20',
            description: 'Strong command of the material'
        };
    }
    if (score >= 70) {
        return {
            level: 'Developing',
            label: 'Good Progress',
            emoji: '',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/20',
            description: 'Solid foundation with room to grow'
        };
    }
    if (score >= 60) {
        return {
            level: 'Emerging',
            label: 'Building Skills',
            emoji: '',
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/20',
            description: 'Making progress, keep practicing'
        };
    }
    // Below 60 - Focus on growth, not failure
    return {
        level: 'Beginning',
        label: 'Getting Started',
        emoji: '',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        description: 'Early stages - great opportunity to learn'
    };
}

/**
 * Get a short constructive label for compact display
 */
export function getShortMasteryLabel(score: number): string {
    return getMasteryLevel(score).label;
}

/**
 * Get color class based on score (for backward compatibility)
 * Uses softer, more encouraging colors
 */
export function getScoreColor(score: number): string {
    return getMasteryLevel(score).color;
}

/**
 * Format score for display with constructive framing
 * Instead of "45%" shows "45% · Getting Started"
 */
export function formatScoreConstructively(score: number, showPercentage = true): string {
    const { label } = getMasteryLevel(score);
    if (showPercentage) {
        return `${score}% · ${label}`;
    }
    return label;
}

export default { getMasteryLevel, getShortMasteryLabel, getScoreColor, formatScoreConstructively };
