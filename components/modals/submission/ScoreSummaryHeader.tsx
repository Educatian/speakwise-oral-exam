import React from 'react';
import { Submission } from '../../../types';
import { getMasteryLevel } from '../../../lib/utils/scoreDisplay';
import { REVIEW_STATUS_LABELS } from './constants';

interface ScoreSummaryHeaderProps {
    submission: Submission;
}

/** Header strip: mastery score, review-status badge, score provenance, session date. */
export const ScoreSummaryHeader: React.FC<ScoreSummaryHeaderProps> = ({ submission }) => {
    const mastery = getMasteryLevel(submission.score);
    const reviewedScore = submission.instructorReview?.overrideScore ?? null;
    const displayScore = reviewedScore ?? submission.score;
    const scoreDelta = reviewedScore == null ? 0 : reviewedScore - submission.score;

    return (
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between bg-slate-900/50 p-6 rounded-2xl border border-slate-800 gap-4">
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className={`text-4xl font-black ${getMasteryLevel(displayScore).color}`}>
                        {getMasteryLevel(displayScore).emoji} {displayScore}%
                    </div>
                    <div className={`text-sm font-bold px-3 py-1 rounded-lg ${mastery.bgColor} ${mastery.color}`}>
                        {getMasteryLevel(displayScore).label}
                    </div>
                    {submission.instructorReview && (
                        <div className="px-3 py-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-xs font-semibold">
                            {REVIEW_STATUS_LABELS[submission.instructorReview.status]}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>AI score: {submission.score}%</span>
                    {reviewedScore != null && (
                        <span>
                            Final reviewed score: {reviewedScore}%
                            {scoreDelta !== 0 && ` (${scoreDelta > 0 ? '+' : ''}${scoreDelta})`}
                        </span>
                    )}
                    <span>{submission.transcript.length} transcript turns</span>
                </div>
            </div>
            <div className="text-left xl:text-right">
                <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-1">
                    Session date
                </h4>
                <p className="text-slate-300 font-medium">
                    <time dateTime={new Date(submission.timestamp).toISOString()}>
                        {new Date(submission.timestamp).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </time>
                </p>
            </div>
        </div>
    );
};
