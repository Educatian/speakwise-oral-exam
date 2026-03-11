import { Submission, ArgumentNode, GroupNetwork, GroupNode, GroupEdge, PeerClaimGroup } from '../../types';

const MIN_GROUP_SIZE = 3;

/**
 * GroupKnowledgeService
 * Pure aggregation functions — no API calls, no side effects.
 * Merges ArgumentGraph data across submissions for group-level analytics.
 */
export class GroupKnowledgeService {

    /**
     * Check if there are enough submissions for group analytics
     */
    static hasEnoughData(submissions: Submission[]): boolean {
        const withGraphs = submissions.filter(s => s.argumentGraph && s.argumentGraph.nodes.length > 0);
        return withGraphs.length >= MIN_GROUP_SIZE;
    }

    /**
     * Build a fused group concept network from all submissions
     */
    static buildGroupNetwork(submissions: Submission[]): GroupNetwork | null {
        const validSubs = submissions.filter(s => s.argumentGraph && s.argumentGraph.nodes.length > 0);
        if (validSubs.length < MIN_GROUP_SIZE) return null;

        // Normalize and count concept frequency
        const conceptMap = new Map<string, {
            label: string;
            type: ArgumentNode['type'];
            studentSet: Set<string>;
        }>();

        for (const sub of validSubs) {
            const studentId = sub.id; // Use submission ID as anonymous identifier
            for (const node of sub.argumentGraph!.nodes) {
                if (node.speaker !== 'user') continue; // Only student concepts

                const key = this.normalizeText(node.content);
                if (key.length < 5) continue; // Skip too-short fragments

                if (!conceptMap.has(key)) {
                    conceptMap.set(key, {
                        label: node.content.substring(0, 60),
                        type: node.type === 'question' ? 'claim' : node.type,
                        studentSet: new Set()
                    });
                }
                conceptMap.get(key)!.studentSet.add(studentId);
            }
        }

        // Build nodes (sorted by frequency)
        const nodes: GroupNode[] = Array.from(conceptMap.entries())
            .map(([id, data]) => ({
                id,
                label: data.label,
                type: data.type as GroupNode['type'],
                frequency: data.studentSet.size,
                studentCount: validSubs.length
            }))
            .filter(n => n.frequency >= 1)
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 20); // Cap at top 20 concepts

        // Build edges from co-occurring concepts within same submission
        const edgeMap = new Map<string, { weight: number; relation: string }>();
        const nodeIds = new Set(nodes.map(n => n.id));

        for (const sub of validSubs) {
            if (!sub.argumentGraph?.edges) continue;
            for (const edge of sub.argumentGraph.edges) {
                // Find corresponding group nodes
                const fromNode = sub.argumentGraph.nodes.find(n => n.id === edge.from);
                const toNode = sub.argumentGraph.nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) continue;

                const fromKey = this.normalizeText(fromNode.content);
                const toKey = this.normalizeText(toNode.content);
                if (!nodeIds.has(fromKey) || !nodeIds.has(toKey)) continue;

                const edgeKey = `${fromKey}→${toKey}`;
                if (!edgeMap.has(edgeKey)) {
                    edgeMap.set(edgeKey, { weight: 0, relation: edge.relation });
                }
                edgeMap.get(edgeKey)!.weight++;
            }
        }

        const edges: GroupEdge[] = Array.from(edgeMap.entries()).map(([key, data]) => {
            const [from, to] = key.split('→');
            return { from, to, weight: data.weight, relation: data.relation };
        });

        return {
            nodes,
            edges,
            totalStudents: validSubs.length
        };
    }

    /**
     * Get anonymous peer claims for comparison
     */
    static getPeerClaims(
        submissions: Submission[],
        currentStudentName: string
    ): { shared: PeerClaimGroup[]; unique: PeerClaimGroup[]; totalPeers: number } | null {
        const validSubs = submissions.filter(s => s.argumentGraph && s.argumentGraph.nodes.length > 0);
        if (validSubs.length < MIN_GROUP_SIZE) return null;

        // Get current student's claims
        const currentSub = validSubs.find(s => s.studentName === currentStudentName);
        const currentClaims = new Set<string>();
        if (currentSub?.argumentGraph?.nodes) {
            for (const node of currentSub.argumentGraph.nodes) {
                if (node.speaker === 'user' && (node.type === 'claim' || node.type === 'evidence')) {
                    currentClaims.add(this.normalizeText(node.content));
                }
            }
        }

        // Get peer claims (excluding current student)
        const peerSubs = validSubs.filter(s => s.studentName !== currentStudentName);
        const peerClaimMap = new Map<string, { claim: string; count: number }>();

        for (const sub of peerSubs) {
            if (!sub.argumentGraph?.nodes) continue;
            const seenInThisSub = new Set<string>(); // Avoid double-counting per student

            for (const node of sub.argumentGraph.nodes) {
                if (node.speaker !== 'user') continue;
                if (node.type !== 'claim' && node.type !== 'evidence') continue;

                const key = this.normalizeText(node.content);
                if (key.length < 10 || seenInThisSub.has(key)) continue;
                seenInThisSub.add(key);

                if (!peerClaimMap.has(key)) {
                    peerClaimMap.set(key, { claim: node.content.substring(0, 80), count: 0 });
                }
                peerClaimMap.get(key)!.count++;
            }
        }

        // Split into shared (overlapping with current) vs unique
        const shared: PeerClaimGroup[] = [];
        const unique: PeerClaimGroup[] = [];

        for (const [key, data] of peerClaimMap) {
            const isShared = currentClaims.has(key);
            const group: PeerClaimGroup = { claim: data.claim, count: data.count, isShared };

            if (isShared) {
                shared.push(group);
            } else if (data.count >= 2) {
                // Only show unique claims that at least 2 peers share
                unique.push(group);
            }
        }

        shared.sort((a, b) => b.count - a.count);
        unique.sort((a, b) => b.count - a.count);

        return {
            shared: shared.slice(0, 5),
            unique: unique.slice(0, 5),
            totalPeers: peerSubs.length
        };
    }

    /** Normalize text for comparison */
    private static normalizeText(text: string): string {
        return text.toLowerCase().trim().replace(/[^a-z0-9가-힣\s]/g, '').substring(0, 60);
    }
}
