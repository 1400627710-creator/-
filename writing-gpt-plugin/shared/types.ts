export type Range = { start: number; end: number };
export type Span = Range & { chapterId: string; rev: number; quote: string };
export type OriginRange = Range & { source: 'ai' };
export type Version = { text: string; generated: OriginRange[] };
export type Chapter = {
  id: string; name: string; order: number; text: string; rev: number;
  generated: OriginRange[]; undo: Version[]; redo: Version[];
};
export type Memory = {
  id: string; key: string; type: 'plot'|'world'|'social'|'character'|'item'|'style'|'knowledge';
  value: string; certainty: 'explicit'|'inference'; evidence: Span[];
  status: 'auto'|'pending'|'confirmed'|'rejected'|'stale';
  authorStatement?: string; correctionOf?: string; authorApprovedStyle?: boolean;
};
export type Mode = 'ask'|'polish'|'ghostwrite'|'learn'|'suggest';
export type Job = {
  id: string; projectId: string; chapterId: string; rev: number; memoryRev: number;
  branch: number; selection: Range; original: string; prompt: string; mode: Mode;
  automatic: boolean; requestId: string; created: number;
  status: 'queued'|'processing'|'done'|'cancelled'|'stale'|'applied'|'rejected';
  result?: ModelReply; usedEvidence: Span[]; selectedMemoryIds: string[]; styleReady?: boolean;
};
export type ModelReply = {
  kind: 'answer'|'candidate'|'ask'|'analysis'; message: string;
  replacement?: string; reasons: string[]; questions: string[];
  evidenceIds: string[]; memories: Array<{
    key: string; type: Memory['type']; value: string; certainty: Memory['certainty'];
    evidence: Span[];
  }>;
};
export type Message = {
  id: string; role: 'user'|'assistant'; text: string; jobId: string;
  branch: number; active: boolean; created: number;
};
export type Project = {
  id: string; name: string; order: number; chapters: Chapter[]; memories: Memory[];
  memoryRev: number; branch: number; messages: Message[]; jobs: Job[];
  proactive: { enabled: boolean; lastRequest: number };
};
export type Database = { schema: 1; revision: number; projects: Project[]; receipts?: Record<string,{fingerprint:string,result:unknown}> };
