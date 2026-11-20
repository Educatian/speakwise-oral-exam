import React, { useDeferredValue, useId, useEffect, useMemo, useRef, useState } from 'react';
import {
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    type SimulationLinkDatum,
    type SimulationNodeDatum
} from 'd3-force';
import { ClaimEvidencePair } from './ClaimEvidencePair';
import { ArgumentEdge, ArgumentGraph, ArgumentNode } from '../../types';

interface TranscriptTurn {
    speaker: string;
    text: string;
    timestamp: number;
}

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
    transcript?: TranscriptTurn[];
    activeTurnIndex?: number | null;
    onActiveTurnIndexChange?: (index: number | null) => void;
    onHighlightTurnsChange?: (indices: number[]) => void;
    storageKey?: string;
}

type Position = { x: number; y: number };
type ViewportState = { x: number; y: number; scale: number };
type LayoutMode = 'radial' | 'force';

const EMPTY_TURNS: number[] = [];
const EMPTY_TRANSCRIPT: TranscriptTurn[] = [];
const VIEW_WIDTH = 880;
const VIEW_HEIGHT = 560;
const DEFAULT_VIEWPORT: ViewportState = { x: 20, y: 20, scale: 0.92 };
const STORAGE_PREFIX = 'speakwise-argument-map-layout';

const RELATION_LABELS: Record<string, string> = {
    defines: 'Defines',
    requires: 'Requires',
    exemplifies: 'Exemplifies',
    enables: 'Enables',
    located_in: 'Located in'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeText(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function getNodeSize(node: ArgumentNode): { width: number; height: number } {
    const width = Math.max(92, Math.min(190, node.content.length * 8 + 34));
    const level = (node.metadata?.level as number | undefined) ?? 2;
    if (level === 0) return { width: width + 38, height: 54 };
    if (level === 1) return { width: width + 14, height: 46 };
    return { width, height: 40 };
}

function getNodeVisual(node: ArgumentNode) {
    switch (node.metadata?.conceptType?.toUpperCase()) {
        case 'DEFINITION':
        case 'THEORY':
            return { fill: '#e6e4fa', stroke: '#6355a4', text: '#342a54' };
        case 'PRINCIPLE':
            return { fill: '#f8e8c5', stroke: '#94631b', text: '#473817' };
        case 'DOMAIN':
            return { fill: '#eadff9', stroke: '#7548ad', text: '#332344' };
        case 'TOOL':
            return { fill: '#d7ebee', stroke: '#2c6f7d', text: '#163d49' };
        case 'EXAMPLE':
            return { fill: '#d7efe5', stroke: '#25735c', text: '#143d32' };
        default:
            return { fill: '#e3e8ec', stroke: '#516374', text: '#273947' };
    }
}

// Toulmin-lens colouring. The argument-graph builder already tags each node
// with a Toulmin-adjacent `type` (claim / evidence / justification /
// counterargument / question); this maps that tag to a colour so researchers
// can see the discourse structure directly without reading every label.
type ToulminType = ArgumentNode['type'];
const TOULMIN_LABELS: Record<ToulminType, string> = {
    claim: 'Claim',
    evidence: 'Evidence',
    justification: 'Warrant',
    counterargument: 'Rebuttal',
    question: 'Question'
};
const TOULMIN_VISUALS: Record<ToulminType, { fill: string; stroke: string; text: string }> = {
    claim:          { fill: '#eadff9', stroke: '#7548ad', text: '#332344' },
    evidence:       { fill: '#d7efe5', stroke: '#25735c', text: '#143d32' },
    justification:  { fill: '#f9e8bd', stroke: '#94631b', text: '#4b3616' },
    counterargument:{ fill: '#f8e1e5', stroke: '#ab4568', text: '#502337' },
    question:       { fill: '#daeafa', stroke: '#3672a2', text: '#173951' }
};
function getToulminVisual(node: ArgumentNode) {
    return TOULMIN_VISUALS[node.type] || { fill: '#e3e8ec', stroke: '#516374', text: '#273947' };
}

function buildRadialLayout(nodes: ArgumentNode[], edges: ArgumentEdge[]): Record<string, Position> {
    const positions: Record<string, Position> = {};
    const root = nodes.find((node) => node.metadata?.level === 0) || nodes[0];
    const level1 = nodes.filter((node) => node !== root && node.metadata?.level === 1);
    const level2 = nodes.filter((node) => node !== root && node.metadata?.level === 2);

    positions[root.id] = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };

    level1.forEach((node, index) => {
        const angle = (-Math.PI / 4) + (index / Math.max(level1.length, 1)) * Math.PI * 2;
        positions[node.id] = {
            x: VIEW_WIDTH / 2 + 202 * Math.cos(angle),
            y: VIEW_HEIGHT / 2 + 150 * Math.sin(angle)
        };
    });

    level2.forEach((node, index) => {
        const parent = edges.find((edge) => edge.to === node.id || edge.from === node.id);
        const parentId = parent?.to === node.id ? parent.from : parent?.to;
        const base = parentId && positions[parentId]
            ? Math.atan2(positions[parentId].y - VIEW_HEIGHT / 2, positions[parentId].x - VIEW_WIDTH / 2)
            : (-Math.PI / 2) + (index / Math.max(level2.length, 1)) * Math.PI * 2;
        const angle = base + (((index % 3) - 1) * 0.22);
        const outerPoint = (direction: number) => ({
            x: VIEW_WIDTH / 2 + 328 * Math.cos(direction),
            y: VIEW_HEIGHT / 2 + 210 * Math.sin(direction)
        });
        const size = getNodeSize(node);
        const fits = (point: Position) => !nodes.some(other => {
            const placed = positions[other.id];
            if (!placed || other.id === node.id) return false;
            const box = getNodeSize(other);
            return Math.abs(point.x - placed.x) < (size.width + box.width) / 2 + 24
                && Math.abs(point.y - placed.y) < (size.height + box.height) / 2 + 28;
        });
        const candidates = [0, .22, -.22, .44, -.44, .66, -.66, .88, -.88].map(offset => outerPoint(angle + offset));
        positions[node.id] = candidates.find(fits) ?? candidates[0];
    });

    nodes.forEach((node, index) => {
        if (!positions[node.id]) {
            const angle = (-Math.PI / 2) + (index / Math.max(nodes.length, 1)) * Math.PI * 2;
            positions[node.id] = {
                x: VIEW_WIDTH / 2 + 210 * Math.cos(angle),
                y: VIEW_HEIGHT / 2 + 210 * Math.sin(angle)
            };
        }
    });

    return positions;
}

// d3-force based one-shot simulation. Runs synchronously on layout switch
// and returns settled positions. The root (level-0) node is pinned at center
// so the whole graph orbits a stable anchor. Level-aware tuning: deeper
// nodes have tighter collision radius and weaker repulsion so hubs breathe.
interface SimNodeDatum extends SimulationNodeDatum {
    collisionRadius: number;
    id: string;
    level: number;
}

type SimLinkDatum = SimulationLinkDatum<SimNodeDatum>;

function buildForceLayout(
    nodes: ArgumentNode[],
    edges: ArgumentEdge[],
    seed: Record<string, Position>
): Record<string, Position> {
    if (nodes.length === 0) return {};

    const root = nodes.find((node) => node.metadata?.level === 0) || nodes[0];

    const simNodes: SimNodeDatum[] = nodes.map((node) => {
        const seeded = seed[node.id];
        const level = (node.metadata?.level as number | undefined) ?? 2;
        const base: SimNodeDatum = {
            collisionRadius: Math.hypot(getNodeSize(node).width, getNodeSize(node).height) / 2 + 12,
            id: node.id,
            level,
            x: seeded?.x ?? VIEW_WIDTH / 2,
            y: seeded?.y ?? VIEW_HEIGHT / 2
        };
        if (node.id === root.id) {
            base.fx = VIEW_WIDTH / 2;
            base.fy = VIEW_HEIGHT / 2;
        }
        return base;
    });

    const simLinks: SimLinkDatum[] = edges
        .filter((edge) => simNodes.some((n) => n.id === edge.from) && simNodes.some((n) => n.id === edge.to))
        .map((edge) => ({ source: edge.from, target: edge.to }));

    const simulation = forceSimulation<SimNodeDatum>(simNodes)
        .force(
            'link',
            forceLink<SimNodeDatum, SimLinkDatum>(simLinks)
                .id((d) => d.id)
                .distance((link) => {
                    const src = link.source as SimNodeDatum;
                    const tgt = link.target as SimNodeDatum;
                    if (src.level === 0 || tgt.level === 0) return 170;
                    if (src.level === 1 || tgt.level === 1) return 130;
                    return 110;
                })
                .strength(0.45)
        )
        .force(
            'charge',
            forceManyBody<SimNodeDatum>().strength((d) =>
                d.level === 0 ? -800 : d.level === 1 ? -520 : -320
            )
        )
        .force(
            'collide',
            forceCollide<SimNodeDatum>().radius(d => d.collisionRadius).iterations(3)
        )
        .force('center', forceCenter(VIEW_WIDTH / 2, VIEW_HEIGHT / 2).strength(0.6))
        .force('x', forceX<SimNodeDatum>(VIEW_WIDTH / 2).strength(0.04))
        .force('y', forceY<SimNodeDatum>(VIEW_HEIGHT / 2).strength(0.04))
        .stop();

    // Run enough ticks for the system to settle. D3's default alpha decay
    // (0.0228) converges well within 300 ticks for graphs of this size.
    for (let i = 0; i < 300; i += 1) simulation.tick();

    const result: Record<string, Position> = {};
    simNodes.forEach((node) => {
        result[node.id] = {
            x: clamp(node.x ?? VIEW_WIDTH / 2, 64, VIEW_WIDTH - 64),
            y: clamp(node.y ?? VIEW_HEIGHT / 2, 56, VIEW_HEIGHT - 56)
        };
    });

    return result;
}

const FullArgumentMap: React.FC<ArgumentMapViewProps> = ({
    graph,
    transcript = EMPTY_TRANSCRIPT,
    activeTurnIndex: suppliedTurnIndex,
    onActiveTurnIndexChange: onTurnChange,
    onHighlightTurnsChange,
    storageKey
}) => {
    const [localTurnIndex, setLocalTurnIndex] = useState<number | null>(null);
    const activeTurnIndex = suppliedTurnIndex === undefined ? localTurnIndex : suppliedTurnIndex;
    const managesTurn = suppliedTurnIndex === undefined;
    const changeTurn = React.useCallback((index: number | null) => {
        if (managesTurn) setLocalTurnIndex(index);
        onTurnChange?.(index);
    }, [managesTurn, onTurnChange]);
    const paintId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('radial');
    const [colorMode, setColorMode] = useState<'concept' | 'toulmin'>('toulmin');
    const [toulminFilter, setToulminFilter] = useState<ToulminType | null>(null);
    const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
    const [positions, setPositions] = useState<Record<string, Position>>(() => buildRadialLayout(graph.nodes, graph.edges));
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
    const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
    const [collapsedClusterIds, setCollapsedClusterIds] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dragRef = useRef<
        | { type: 'pan'; x: number; y: number; viewport: ViewportState }
        | { type: 'node'; nodeId: string; pointer: Position; origin: Position; moved: boolean }
        | null
    >(null);

    const radialPositions = useMemo(() => buildRadialLayout(graph.nodes, graph.edges), [graph.edges, graph.nodes]);
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const nodesById = useMemo(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node] as const)), [graph.nodes]);
    const relationOptions = useMemo(() => Array.from(new Set(graph.edges.map((edge) => edge.relation))), [graph.edges]);
    const persistedLayoutKey = storageKey ? `${STORAGE_PREFIX}:${storageKey}` : null;

    useEffect(() => {
        if (!persistedLayoutKey) return;

        try {
            const raw = localStorage.getItem(persistedLayoutKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                layoutMode?: LayoutMode;
                viewport?: ViewportState;
                positions?: Record<string, Position>;
                collapsedClusterIds?: string[];
            };

            if (parsed.layoutMode === 'force' || parsed.layoutMode === 'radial') {
                setLayoutMode(parsed.layoutMode);
            }

            if (parsed.viewport) {
                setViewport({
                    x: Number.isFinite(parsed.viewport.x) ? parsed.viewport.x : DEFAULT_VIEWPORT.x,
                    y: Number.isFinite(parsed.viewport.y) ? parsed.viewport.y : DEFAULT_VIEWPORT.y,
                    scale: Number.isFinite(parsed.viewport.scale) ? parsed.viewport.scale : DEFAULT_VIEWPORT.scale
                });
            }

            if (parsed.collapsedClusterIds) {
                setCollapsedClusterIds(parsed.collapsedClusterIds.filter((id) => graph.nodes.some((node) => node.id === id)));
            }

            if (parsed.positions) {
                const merged = { ...radialPositions };
                graph.nodes.forEach((node) => {
                    const persisted = parsed.positions?.[node.id];
                    if (persisted && Number.isFinite(persisted.x) && Number.isFinite(persisted.y)) {
                        merged[node.id] = persisted;
                    }
                });
                setPositions(merged);
            }
        } catch {
            // Ignore corrupted persisted layouts and fall back to computed positions.
        }
    }, [graph.nodes, persistedLayoutKey, radialPositions]);

    useEffect(() => {
        setFocusedNodeId(null);
        setSelectedRelation(null);
        setSelectedEdgeKey(null);
        if (!persistedLayoutKey) {
            setLayoutMode('radial');
            setPositions(radialPositions);
            setViewport(DEFAULT_VIEWPORT);
            setCollapsedClusterIds([]);
        }
    }, [persistedLayoutKey, radialPositions]);

    useEffect(() => {
        if (!persistedLayoutKey) return;

        localStorage.setItem(persistedLayoutKey, JSON.stringify({
            layoutMode,
            viewport,
            positions,
            collapsedClusterIds
        }));
    }, [collapsedClusterIds, layoutMode, persistedLayoutKey, positions, viewport]);

    const mentionMap = useMemo(() => {
        const result = new Map<string, number[]>();
        graph.nodes.forEach((node) => {
            const nodeText = normalizeText(node.content);
            const indices = transcript.flatMap((turn, index) => {
                const turnText = normalizeText(turn.text);
                const sourceTurn = node.timestamp === turn.timestamp && turn.speaker === node.speaker;
                return sourceTurn || (nodeText && turnText.includes(nodeText)) ? [index] : [];
            });
            result.set(node.id, Array.from(new Set(indices)));
        });
        return result;
    }, [graph.nodes, transcript]);

    const firstMentionIndexMap = useMemo(() => {
        const result = new Map<string, number | null>();
        graph.nodes.forEach((node) => {
            const matches = mentionMap.get(node.id) || [];
            result.set(node.id, matches.length > 0 ? matches[0] : null);
        });
        return result;
    }, [graph.nodes, mentionMap]);

    const clusterMap = useMemo(() => {
        const result = new Map<string, string[]>();
        graph.nodes.filter((node) => node.metadata?.level === 1).forEach((node) => {
            const children = graph.edges.flatMap((edge) => {
                if (edge.to === node.id && nodesById[edge.from]?.metadata?.level === 2) return [edge.from];
                if (edge.from === node.id && nodesById[edge.to]?.metadata?.level === 2) return [edge.to];
                return [];
            });
            result.set(node.id, Array.from(new Set(children)));
        });
        return result;
    }, [graph.edges, graph.nodes, nodesById]);

    const hiddenNodeIds = useMemo(() => {
        const hidden = new Set<string>();
        collapsedClusterIds.forEach((id) => (clusterMap.get(id) || []).forEach((child) => hidden.add(child)));
        return hidden;
    }, [clusterMap, collapsedClusterIds]);

    const searchedNodeIds = useMemo(() => {
        const query = deferredSearchQuery.trim().toLowerCase();
        if (!query) return null;

        const matchingIds = graph.nodes
            .filter((node) =>
                node.content.toLowerCase().includes(query) ||
                (node.metadata?.conceptType || '').toLowerCase().includes(query) ||
                node.type.toLowerCase().includes(query)
            )
            .map((node) => node.id);

        return new Set(matchingIds);
    }, [deferredSearchQuery, graph.nodes]);

    const visibleTimelineNodeIds = useMemo(() => {
        const visible = new Set<string>();
        graph.nodes.forEach((node) => {
            const firstMention = firstMentionIndexMap.get(node.id);
            if (activeTurnIndex == null || firstMention == null || firstMention <= activeTurnIndex || node.metadata?.level === 0) {
                visible.add(node.id);
            }
        });
        return visible;
    }, [activeTurnIndex, firstMentionIndexMap, graph.nodes]);

    const filteredEdges = useMemo(() => graph.edges.filter((edge) => {
        if (!visibleTimelineNodeIds.has(edge.from) || !visibleTimelineNodeIds.has(edge.to)) return false;
        if (hiddenNodeIds.has(edge.from) || hiddenNodeIds.has(edge.to)) return false;
        if (selectedRelation && edge.relation !== selectedRelation) return false;
        if (searchedNodeIds && !searchedNodeIds.has(edge.from) && !searchedNodeIds.has(edge.to)) return false;
        return true;
    }), [graph.edges, hiddenNodeIds, searchedNodeIds, selectedRelation, visibleTimelineNodeIds]);

    const visibleNodeIds = useMemo(() => {
        const passesToulmin = (node: ArgumentNode) =>
            !toulminFilter || node.type === toulminFilter;

        if (!selectedRelation) {
            return new Set(graph.nodes
                .filter((node) => visibleTimelineNodeIds.has(node.id) && !hiddenNodeIds.has(node.id))
                .filter((node) => !searchedNodeIds || searchedNodeIds.has(node.id))
                .filter(passesToulmin)
                .map((node) => node.id));
        }
        const relationNodes = new Set<string>();
        filteredEdges.forEach((edge) => {
            const fromNode = nodesById[edge.from];
            const toNode = nodesById[edge.to];
            if (fromNode && passesToulmin(fromNode)) relationNodes.add(edge.from);
            if (toNode && passesToulmin(toNode)) relationNodes.add(edge.to);
        });
        if (focusedNodeId && nodesById[focusedNodeId] && passesToulmin(nodesById[focusedNodeId])) {
            relationNodes.add(focusedNodeId);
        }
        return relationNodes;
    }, [filteredEdges, focusedNodeId, graph.nodes, hiddenNodeIds, nodesById, searchedNodeIds, selectedRelation, toulminFilter, visibleTimelineNodeIds]);

    const visibleNodes = useMemo(() => graph.nodes.filter((node) => visibleNodeIds.has(node.id)), [graph.nodes, visibleNodeIds]);
    const focusedNode = focusedNodeId ? nodesById[focusedNodeId] || null : null;
    const focusedTurns = (focusedNode && mentionMap.get(focusedNode.id)) || EMPTY_TURNS;
    const focusedEdges = focusedNode ? graph.edges.filter((edge) => edge.from === focusedNode.id || edge.to === focusedNode.id) : [];

    // Track which node ids just transitioned into the visible set — these get
    // an enter animation (CSS). Wiped after the animation window so the class
    // doesn't keep retriggering layout paints.
    const previouslyVisibleRef = useRef<Set<string>>(new Set());
    const [newlyVisibleIds, setNewlyVisibleIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        const prev = previouslyVisibleRef.current;
        const entered = new Set<string>();
        visibleNodeIds.forEach((id) => {
            if (!prev.has(id)) entered.add(id);
        });
        previouslyVisibleRef.current = new Set(visibleNodeIds);
        if (entered.size === 0) return;
        setNewlyVisibleIds(entered);
        const timer = window.setTimeout(() => setNewlyVisibleIds(new Set()), 700);
        return () => window.clearTimeout(timer);
    }, [visibleNodeIds]);

    function togglePlayback() {
        if (!isPlaying && (activeTurnIndex == null || activeTurnIndex >= transcript.length - 1)) changeTurn(0);
        setIsPlaying(!isPlaying);
    }

    function handleTimelineKey(event: React.KeyboardEvent<HTMLDivElement>) {
        const target = event.target as Element;
        if (!transcript.length || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey
            || target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const current = activeTurnIndex ?? -1;
        const last = transcript.length - 1;
        switch (event.key) {
            case 'ArrowLeft': changeTurn(current <= 0 ? null : current - 1); break;
            case 'ArrowRight': changeTurn(Math.min(last, current + 1)); break;
            case 'Home': changeTurn(0); break;
            case 'End': changeTurn(last); break;
            case ' ':
                if (target.closest('button, [role="button"], summary, a')) return;
                event.preventDefault();
                togglePlayback();
                return;
            default: return;
        }
        event.preventDefault();
        setIsPlaying(false);
    }

    useEffect(() => {
        if (onHighlightTurnsChange) {
            onHighlightTurnsChange(focusedTurns.length > 0 ? focusedTurns : activeTurnIndex != null ? [activeTurnIndex] : []);
        }
    }, [activeTurnIndex, focusedTurns, onHighlightTurnsChange]);

    useEffect(() => {
        if (!isPlaying || transcript.length === 0) return;
        const timer = window.setInterval(() => {
            const next = activeTurnIndex == null ? 0 : activeTurnIndex + 1;
            if (next >= transcript.length) {
                setIsPlaying(false);
                return;
            }
            changeTurn(next);
        }, 1100);
        return () => window.clearInterval(timer);
    }, [activeTurnIndex, isPlaying, changeTurn, transcript.length]);

    const clientToWorld = (clientX: number, clientY: number): Position | null => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
        const svgY = ((clientY - rect.top) / rect.height) * VIEW_HEIGHT;
        return { x: (svgX - viewport.x) / viewport.scale, y: (svgY - viewport.y) / viewport.scale };
    };

    const clientToSvg = (clientX: number, clientY: number): Position | null => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return { x: ((clientX - rect.left) / rect.width) * VIEW_WIDTH, y: ((clientY - rect.top) / rect.height) * VIEW_HEIGHT };
    };

    useEffect(() => {
        const handleMove = (event: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            if (drag.type === 'pan') {
                setViewport({ ...drag.viewport, x: drag.viewport.x + (event.clientX - drag.x), y: drag.viewport.y + (event.clientY - drag.y) });
                return;
            }
            const point = clientToWorld(event.clientX, event.clientY);
            if (!point) return;
            const dx = point.x - drag.pointer.x;
            const dy = point.y - drag.pointer.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
            setPositions((current) => ({ ...current, [drag.nodeId]: { x: clamp(drag.origin.x + dx, 40, VIEW_WIDTH - 40), y: clamp(drag.origin.y + dy, 40, VIEW_HEIGHT - 40) } }));
        };
        const handleUp = () => { dragRef.current = null; };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [viewport]);

    if (graph.nodes.length === 0) {
        return <div className="text-center py-10 text-slate-400">Knowledge network is building...</div>;
    }

    const visualFor = colorMode === 'toulmin' ? getToulminVisual : getNodeVisual;
    const neighbors = new Set(focusedEdges.flatMap(edge => [edge.from, edge.to]));
    const minimapViewport = { x: (-viewport.x) / viewport.scale, y: (-viewport.y) / viewport.scale, width: VIEW_WIDTH / viewport.scale, height: VIEW_HEIGHT / viewport.scale };

    const downloadFile = (filename: string, content: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportJson = () => {
        downloadFile(
            `${storageKey || 'concept-map'}.json`,
            JSON.stringify({ graph, viewport, positions, collapsedClusterIds }, null, 2),
            'application/json'
        );
    };

    const handleExportSvg = () => {
        if (!svgRef.current) return;
        const serializer = new XMLSerializer();
        downloadFile(
            `${storageKey || 'concept-map'}.svg`,
            serializer.serializeToString(svgRef.current),
            'image/svg+xml;charset=utf-8'
        );
    };

    return (
        <div className="sw-concept-map space-y-4" role="region" aria-label="Argument map" tabIndex={0} onKeyDown={handleTimelineKey}>
            <div className="sw-atlas-header">
                <div>
                    <h4 className="sw-atlas-title">Argument map</h4>
                    <p className="text-xs text-slate-500 mt-1">Select a concept to see its connections and original words.</p>
                </div>
                <div className="sw-atlas-search">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        aria-label="Search concepts" placeholder="Search concepts"
                        className="w-full sm:w-44 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    />
                </div>
            </div>
            <details className="sw-map-options">
                <summary>Layout, filters and export</summary>
                <div className="sw-map-toolbar flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setLayoutMode('radial'); setPositions(radialPositions); }} className={`px-3 py-2 rounded-xl text-xs border ${layoutMode === 'radial' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900/60 text-slate-400'}`}>Radial</button>
                    <button type="button" onClick={() => { setLayoutMode('force'); setPositions((current) => buildForceLayout(graph.nodes, graph.edges, current)); }} className={`px-3 py-2 rounded-xl text-xs border ${layoutMode === 'force' ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-slate-700 bg-slate-900/60 text-slate-400'}`}>Force</button>
                    <button
                        type="button"
                        onClick={() => { setToulminFilter(null); setColorMode(m => m === 'concept' ? 'toulmin' : 'concept'); }}
                        className={`px-3 py-2 rounded-xl text-xs border ${colorMode === 'toulmin' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-900/60 text-slate-400'}`}
                        title="Toggle between concept-type and Toulmin colouring"
                    >
                        {colorMode === 'toulmin' ? 'Color: Toulmin' : 'Color: Concept'}
                    </button>
                    <button type="button" onClick={() => setViewport(DEFAULT_VIEWPORT)} className="px-3 py-2 rounded-xl text-xs border border-slate-700 bg-slate-900/60 text-slate-400">Reset view</button>
                    <button type="button" onClick={() => { setSelectedRelation(null); setSelectedEdgeKey(null); setToulminFilter(null); }} className="px-3 py-2 rounded-xl text-xs border border-slate-700 bg-slate-900/60 text-slate-400">Clear filter</button>
                    <button type="button" onClick={handleExportJson} className="px-3 py-2 rounded-xl text-xs border border-slate-700 bg-slate-900/60 text-slate-400">Export JSON</button>
                    <button type="button" onClick={handleExportSvg} className="px-3 py-2 rounded-xl text-xs border border-slate-700 bg-slate-900/60 text-slate-400">Export SVG</button>
                </div>

            {deferredSearchQuery.trim() && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
                    {visibleNodes.length} concept{visibleNodes.length !== 1 ? 's' : ''} matched “{deferredSearchQuery.trim()}”.
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {relationOptions.map((relation) => (
                    <button key={relation} type="button" onClick={() => { setSelectedRelation((current) => current === relation ? null : relation); setSelectedEdgeKey(null); }} className={`px-3 py-1.5 rounded-full text-[11px] border ${selectedRelation === relation ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-slate-700 bg-slate-900/40 text-slate-500'}`}>
                        {RELATION_LABELS[relation] || relation}
                    </button>
                ))}
            </div>

            {Array.from(clusterMap.keys()).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Array.from(clusterMap.keys()).map((clusterId) => (
                        <button key={clusterId} type="button" onClick={() => setCollapsedClusterIds((current) => current.includes(clusterId) ? current.filter((id) => id !== clusterId) : [...current, clusterId])} className={`px-3 py-1.5 rounded-full text-[11px] border ${collapsedClusterIds.includes(clusterId) ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-900/40 text-slate-400'}`}>
                            {collapsedClusterIds.includes(clusterId) ? 'Expand' : 'Collapse'} {nodesById[clusterId]?.content}
                        </button>
                    ))}
                </div>
            )}

            </details>
            {colorMode === 'toulmin' && (
                <div className="sw-role-key" aria-label="Filter by argument role" role="group">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-600 font-bold pr-1">Roles</span>
                    {(Object.keys(TOULMIN_LABELS) as ToulminType[]).filter(type => graph.nodes.some(node => node.type === type)).map((t) => {
                        const v = TOULMIN_VISUALS[t];
                        const active = toulminFilter === t;
                        return (
                            <button
                                key={t} aria-pressed={active} data-role={t}
                                type="button"
                                onClick={() => setToulminFilter((current) => (current === t ? null : t))}
                                className={`px-3 py-1.5 rounded-full text-[11px] border flex items-center gap-1.5 ${active ? 'bg-slate-900/70 text-slate-100' : 'bg-slate-900/40 text-slate-400'}`}
                                style={active ? { borderColor: v.stroke } : { borderColor: 'rgba(100, 116, 139, 0.35)' }}
                            >
                                <span
                                    aria-hidden="true"
                                    className="inline-block w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: v.fill }}
                                />
                                {TOULMIN_LABELS[t]}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="sw-map-layout">
                <div className="relative rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden">
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                        className="w-full h-auto block"
                        onWheel={(event) => {
                            event.preventDefault();
                            const anchor = clientToSvg(event.clientX, event.clientY);
                            if (!anchor) return;
                            const nextScale = clamp(viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08), 0.45, 2.8);
                            const worldX = (anchor.x - viewport.x) / viewport.scale;
                            const worldY = (anchor.y - viewport.y) / viewport.scale;
                            setViewport({ scale: nextScale, x: anchor.x - worldX * nextScale, y: anchor.y - worldY * nextScale });
                        }}
                        onPointerDown={(event) => {
                            if ((event.target as Element).closest('[data-node="true"], [data-edge="true"]')) return;
                            dragRef.current = { type: 'pan', x: event.clientX, y: event.clientY, viewport };
                        }}
                    >
                        <defs>
                            <radialGradient id={paintId + '-sky'} cx="45%" cy="42%" r="76%">
                                <stop stopColor="#fffcf5" /><stop offset=".58" stopColor="#f8f5eb" /><stop offset="1" stopColor="#ece8db" />
                            </radialGradient>
                            <pattern id={paintId + '-grid'} width="22" height="22" patternUnits="userSpaceOnUse">
                                <circle cx="1" cy="1" r=".95" fill="#757e71" opacity=".26" />
                            </pattern>
                        </defs>
                        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${paintId}-sky)`} />
                        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${paintId}-grid)`} />
                        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
                            <circle cx={VIEW_WIDTH / 2} cy={VIEW_HEIGHT / 2} r="150" fill="none" stroke="#928c89" strokeOpacity=".19" strokeDasharray="3 9" />
                            <circle cx={VIEW_WIDTH / 2} cy={VIEW_HEIGHT / 2} r="255" fill="none" stroke="#928c89" strokeOpacity=".19" strokeDasharray="3 9" />
                            {filteredEdges.map((edge, index) => {
                                const from = positions[edge.from];
                                const to = positions[edge.to];
                                if (!from || !to || !nodesById[edge.from] || !nodesById[edge.to]) return null;
                                const dx = to.x - from.x;
                                const dy = to.y - from.y;
                                const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                                const ux = dx / dist;
                                const uy = dy / dist;
                                // Start and end at the visible labels, including wide labels on near-horizontal links.
                                const extent = (node: ArgumentNode) => {
                                    const size = getNodeSize(node);
                                    return Math.min(size.width / (2 * Math.abs(ux) || 1e-8), size.height / (2 * Math.abs(uy) || 1e-8), dist / 2);
                                };
                                const start = extent(nodesById[edge.from]), end = extent(nodesById[edge.to]);
                                const startX = from.x + ux * start, startY = from.y + uy * start;
                                const endX = to.x - ux * end, endY = to.y - uy * end;
                                const bend = (index % 2 === 0 ? 1 : -1) * Math.min(18, (dist - start - end) / 4);
                                const midX = (startX + endX) / 2 - uy * bend;
                                const midY = (startY + endY) / 2 + ux * bend;
                                const edgeKey = `${edge.from}-${edge.to}-${edge.relation}`;
                                const isFocused = selectedEdgeKey === edgeKey || focusedNodeId === edge.from || focusedNodeId === edge.to;
                                const path = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
                                const gradient = paintId + '-link-' + index;
                                const ink = `url(#${gradient})`;
                                return (
                                    <g key={edgeKey} opacity={focusedNodeId && !isFocused ? .44 : 1}>
                                        <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
                                            <stop stopColor={visualFor(nodesById[edge.from]).stroke} />
                                            <stop offset="1" stopColor={visualFor(nodesById[edge.to]).stroke} />
                                        </linearGradient></defs>
                                        {isFocused && <path d={path} fill="none" stroke={ink} strokeWidth="9" opacity=".19" />}
                                        <path d={path} fill="none" stroke={ink} strokeWidth={isFocused ? 3 : 1.9} opacity={isFocused ? 1 : .86} strokeDasharray={edge.relation === 'requires' || edge.relation === 'located_in' ? '5 5' : undefined} />
                                        <path data-edge="true" d={path} fill="none" stroke="transparent" strokeWidth="12" className="cursor-pointer" onClick={(event) => { event.stopPropagation(); setSelectedEdgeKey(edgeKey); setSelectedRelation(edge.relation); }} />
                                        <text x={(startX + 2 * midX + endX) / 4} y={(startY + 2 * midY + endY) / 4 - 6} pointerEvents="none" stroke="#faf6eb" strokeWidth="5" paintOrder="stroke" fill={isFocused ? '#242b31' : '#545c60'} fontSize="12" fontWeight="600" textAnchor="middle">{RELATION_LABELS[edge.relation] || edge.relation}</text>
                                    </g>
                                );
                            })}
                            {visibleNodes.map((node) => {
                                const position = positions[node.id];
                                if (!position) return null;
                                const size = getNodeSize(node);
                                const visual = visualFor(node);
                                const isFocused = focusedNodeId === node.id;
                                const isMentioned = activeTurnIndex != null && (mentionMap.get(node.id) || []).includes(activeTurnIndex);
                                const isEntering = newlyVisibleIds.has(node.id);
                                return (
                                    <g
                                        key={node.id}
                                        opacity={focusedNodeId && !neighbors.has(node.id) && !isFocused ? .52 : 1}
                                        data-node="true"
                                        transform={`translate(${position.x} ${position.y})`}
                                        className="cursor-pointer sw-map-node"
                                        role="button" tabIndex={0} aria-label={node.content} aria-pressed={isFocused}
                                        onKeyDown={event => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                event.currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                                            }
                                        }}
                                        onPointerDown={(event) => {
                                            event.stopPropagation();
                                            const point = clientToWorld(event.clientX, event.clientY);
                                            if (!point) return;
                                            dragRef.current = { type: 'node', nodeId: node.id, pointer: point, origin: positions[node.id], moved: false };
                                        }}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (dragRef.current?.type === 'node' && dragRef.current.nodeId === node.id && dragRef.current.moved) return;
                                            setFocusedNodeId((current) => current === node.id ? null : node.id);
                                            const mentions = mentionMap.get(node.id) || [];
                                            if (mentions.length > 0) {
                                                setIsPlaying(false);
                                                const source = mentions.find(i => transcript[i].timestamp === node.timestamp && transcript[i].speaker === node.speaker);
                                                changeTurn(source ?? mentions[0]);
                                            }
                                        }}
                                    >
                                        <title>{node.content}</title>
                                        <g className={`arg-node${isEntering ? ' arg-node-enter' : ''}${isMentioned ? ' arg-node-active' : ''}`}>
                                        {isFocused && <rect x={-size.width / 2 - 5} y={-size.height / 2 - 5} width={size.width + 10} height={size.height + 10} rx="18" stroke={visual.stroke} strokeOpacity=".35" strokeWidth="5" fill="none" />}
                                        <rect x={-size.width / 2} y={-size.height / 2} width={size.width} height={size.height} rx="12" fill={visual.fill} stroke={isFocused ? '#332840' : visual.stroke} strokeWidth={isFocused ? 2.8 : 1.7} />
                                        <text x="0" y="-6" fill={visual.stroke} fontSize="9" letterSpacing="1.1" fontWeight="700" textAnchor="middle">{(colorMode === 'toulmin' ? TOULMIN_LABELS[node.type] : node.metadata?.conceptType || node.type).toUpperCase()}</text>
                                        {isMentioned && <rect x={-size.width / 2 - 4} y={-size.height / 2 - 4} width={size.width + 8} height={size.height + 8} rx={node.metadata?.level === 0 ? 20 : 16} fill="none" stroke="#16795a" strokeWidth={2} strokeDasharray="4 4" />}
                                        <text x="0" y="12" fill={visual.text} fontSize={node.metadata?.level === 0 ? 16 : 14} fontWeight={node.metadata?.level === 0 ? 800 : 700} textAnchor="middle">{node.content.length > 24 ? node.content.slice(0, 23) + '…' : node.content}</text>
                                        </g>
                                    </g>
                                );
                            })}
                        </g>
                    </svg>

                    <details className="sw-minimap"><summary>Minimap · {Math.round(viewport.scale * 100)}%</summary>
                        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="w-full h-auto rounded-lg bg-slate-900/80">
                            {graph.edges.map((edge) => <line key={`${edge.from}-${edge.to}-${edge.relation}`} x1={positions[edge.from]?.x || 0} y1={positions[edge.from]?.y || 0} x2={positions[edge.to]?.x || 0} y2={positions[edge.to]?.y || 0} stroke="#334155" strokeWidth="1" opacity="0.5" />)}
                            {graph.nodes.map((node) => <circle key={node.id} cx={positions[node.id]?.x || 0} cy={positions[node.id]?.y || 0} r={node.metadata?.level === 0 ? 10 : node.metadata?.level === 1 ? 7 : 5} fill={focusedNodeId === node.id ? '#f8fafc' : (colorMode === 'toulmin' ? getToulminVisual(node).stroke : getNodeVisual(node).stroke)} opacity={visibleNodeIds.has(node.id) ? 0.95 : 0.24} />)}
                            <rect x={minimapViewport.x} y={minimapViewport.y} width={minimapViewport.width} height={minimapViewport.height} fill="none" stroke="#22d3ee" strokeWidth="8" opacity="0.75" />
                        </svg>
                    </details>
                </div>

                <aside className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 space-y-5">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Focused concept</p>
                        {focusedNode ? (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h5 className="text-white font-semibold">{focusedNode.content}</h5>
                                            <p className="text-xs text-slate-500 mt-1">{focusedNode.metadata?.conceptType || focusedNode.type} • Level {focusedNode.metadata?.level ?? 1}</p>
                                        </div>
                                        <button type="button" onClick={() => setFocusedNodeId(null)} className="text-xs text-slate-500 hover:text-slate-300">Clear</button>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-600 font-bold mb-3">Connected relations</p>
                                    <div className="space-y-2">
                                        {focusedEdges.length > 0 ? focusedEdges.map((edge) => {
                                            const partnerId = edge.from === focusedNode.id ? edge.to : edge.from;
                                            return (
                                                <button key={`${edge.from}-${edge.to}-${edge.relation}`} type="button" onClick={() => { setSelectedRelation(edge.relation); setSelectedEdgeKey(`${edge.from}-${edge.to}-${edge.relation}`); setFocusedNodeId(partnerId); }} className="w-full text-left rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 hover:border-indigo-500/30">
                                                    <p className="text-sm text-slate-200">{nodesById[partnerId]?.content || partnerId}</p>
                                                    <p className="text-[11px] text-slate-500 mt-1">{RELATION_LABELS[edge.relation] || edge.relation}</p>
                                                </button>
                                            );
                                        }) : <p className="text-sm text-slate-500">No connected relations were found.</p>}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-600 font-bold mb-3">Transcript references</p>
                                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                        {focusedTurns.length > 0 ? focusedTurns.map((turnIndex) => (
                                            <button key={turnIndex} type="button" onClick={() => { setIsPlaying(false); changeTurn(turnIndex); }} className={`w-full rounded-xl border px-3 py-3 text-left ${activeTurnIndex === turnIndex ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}>
                                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600 font-semibold mb-2">Turn {turnIndex + 1}</p>
                                                <p className="text-sm text-slate-300 leading-relaxed">{transcript[turnIndex]?.text || 'Transcript segment unavailable.'}</p>
                                            </button>
                                        )) : <p className="text-sm text-slate-500">No direct transcript mention was matched to this node.</p>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-5 text-sm text-slate-400">
                                Click any node to inspect transcript evidence, connected edges, and focus state.
                            </div>
                        )}
                    </div>

                    {transcript.length > 0 && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-600 font-bold">Timeline playback</p>
                                    <p className="text-[11px] text-slate-500 mt-1">Replay the interview turn by turn.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={togglePlayback} className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-950/40 text-xs text-slate-300">{isPlaying ? 'Pause' : 'Play'}</button>
                                    <button type="button" onClick={() => { setIsPlaying(false); changeTurn(null); }} className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-950/40 text-xs text-slate-400">Full map</button>
                                </div>
                            </div>
                            <input type="range" aria-label="Interview turn" min={0} max={Math.max(0, transcript.length - 1)} value={activeTurnIndex ?? transcript.length - 1} onChange={(event) => { setIsPlaying(false); changeTurn(Number(event.target.value)); }} className="w-full accent-emerald-400" />
                            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                                <span>Turn 1</span>
                                <span>{activeTurnIndex == null ? 'Showing all turns' : `Focused turn ${activeTurnIndex + 1} of ${transcript.length}`}</span>
                                <span>Turn {transcript.length}</span>
                            </div>
                            {activeTurnIndex != null && transcript[activeTurnIndex] && <blockquote className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm text-slate-200">
                                <span className="block text-xs text-slate-400">{transcript[activeTurnIndex].speaker === 'user' ? 'Student' : 'Interviewer'}</span>
                                {transcript[activeTurnIndex].text}
                            </blockquote>}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

export function ArgumentMapView(props: ArgumentMapViewProps) {
    const [expanded, setExpanded] = useState(false);
    return <div className="sw-map-overview">
        <ClaimEvidencePair graph={props.graph} transcript={props.transcript ?? EMPTY_TRANSCRIPT} />
        {!!props.graph.nodes.length && <details className="sw-disclosure" onToggle={e => setExpanded(e.currentTarget.open)}>
            <summary>Full concept map and tools</summary>
            {expanded && <FullArgumentMap key={props.storageKey} {...props} />}
        </details>}
    </div>;
}

export default ArgumentMapView;
