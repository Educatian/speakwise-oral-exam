import React, { useMemo } from 'react';
import type { ArgumentGraph, ArgumentNode } from '../../types';

type Turn = { speaker: string; text: string; timestamp: number };
type Props = { graph: ArgumentGraph; transcript: Turn[]; answerTurnIndex?: number };

function findSource(node: ArgumentNode, transcript: Turn[]) {
    const sameSpeaker = transcript.map((turn, index) => ({turn, index}))
        .filter(({turn}) => turn.speaker === node.speaker && turn.text.trim());
    const timed = sameSpeaker.filter(({turn}) => turn.timestamp === node.timestamp);
    if (timed.length === 1) return timed[0];
    const content = node.content.trim().toLowerCase();
    if (!content) return undefined;
    const matches = (timed.length ? timed : sameSpeaker).filter(({turn}) => turn.text.toLowerCase().includes(content));
    return matches.length === 1 ? matches[0] : undefined;
}

function findPair({ graph, transcript, answerTurnIndex }: Props) {
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    for (const edge of graph.edges) {
        const from = nodes.get(edge.from), to = nodes.get(edge.to);
        if (!from || !to || from.speaker !== 'user' || to.speaker !== 'user') continue;
        const [claim, evidence] = from.type === 'claim' ? [from, to] : [to, from];
        if (claim.type !== 'claim' || evidence.type !== 'evidence') continue;
        const first = findSource(claim, transcript), second = findSource(evidence, transcript);
        if (!first || !second) continue;
        if (answerTurnIndex !== undefined && first.index !== answerTurnIndex && second.index !== answerTurnIndex) continue;
        return { claim, evidence, first, second, edge };
    }
}

function SourceExcerpt({text, nodes}: {text: string; nodes: ArgumentNode[]}) {
    const ranges = nodes.map(node => {
        const start = text.toLowerCase().indexOf(node.content.toLowerCase());
        return { start, end: start + node.content.length, type: node.type };
    }).filter(range => range.start >= 0 && range.end > range.start).sort((a, b) => a.start - b.start);
    const pieces: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start < cursor) continue;
        pieces.push(text.slice(cursor, range.start), <mark key={range.start} data-role={range.type}>{text.slice(range.start, range.end)}</mark>);
        cursor = range.end;
    }
    return <>{pieces}{text.slice(cursor)}</>;
}

export function ClaimEvidencePair(props: Props) {
    const {graph, transcript, answerTurnIndex} = props;
    const pair = useMemo(() => findPair({graph, transcript, answerTurnIndex}), [graph, transcript, answerTurnIndex]);
    const inEdgeOrder = pair && (pair.edge.from === pair.claim.id
        ? [{ node: pair.claim, source: pair.first }, { node: pair.evidence, source: pair.second }]
        : [{ node: pair.evidence, source: pair.second }, { node: pair.claim, source: pair.first }]);
    return <section className="sw-evidence-pair">
        <h4>Claim and evidence</h4>
        {pair ? <>
            <div className="sw-linked-excerpts">
                {inEdgeOrder?.map(({node, source}, index) => <React.Fragment key={node.id}>
                    {index === 1 && <span className="sw-pair-bridge"><span>{pair.edge.relation.replace(/_/g, ' ')}</span></span>}
                    <div className="sw-excerpt-card" data-role={node.type}>
                        <small><i aria-hidden="true" />{node.type === 'claim' ? 'Claim' : 'Evidence'}<span>Turn {source.index + 1}</span></small>
                        <p>{node.content}</p>
                    </div>
                </React.Fragment>)}
            </div>
            <details key={pair.claim.id + '/' + pair.evidence.id} className="sw-disclosure">
                <summary>See the connection in the transcript</summary>
                {[pair.first, ...(pair.first.index === pair.second.index ? [] : [pair.second])].map(({turn,index}) =>
                    <blockquote key={index}><small>Original answer &middot; Turn {index + 1}</small><SourceExcerpt text={turn.text} nodes={inEdgeOrder!.filter(item => item.source.index === index).map(item => item.node)} /></blockquote>)}
            </details>
        </> : <p>{answerTurnIndex === undefined ? 'No claim and evidence could be traced to a linked pair in this transcript.' : 'No linked claim and evidence were found for this answer.'}</p>}
    </section>;
}
