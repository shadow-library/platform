/** A brief's epistemic contract: who bounds the chapter, who learns what. */
interface KnowledgeReveal {
  entityKey: string;
  factKey: string;
}

export interface KnowledgeContract {
  pov: string[];
  learns: KnowledgeReveal[];
}

/** Parses a brief's stored `knowledgeContract`; null (feature off) unless it names at least one POV entity. */
export function parseKnowledgeContract(raw: unknown): KnowledgeContract | null {
  if (!raw || typeof raw !== 'object') return null;
  const contract = raw as { pov?: unknown; learns?: unknown };
  const pov = Array.isArray(contract.pov) ? contract.pov.filter((key): key is string => typeof key === 'string' && key.length > 0) : [];
  if (pov.length === 0) return null;
  const learns = Array.isArray(contract.learns)
    ? contract.learns.filter((entry): entry is KnowledgeReveal => {
        const reveal = entry as Partial<KnowledgeReveal> | null;
        return typeof reveal?.entityKey === 'string' && typeof reveal.factKey === 'string';
      })
    : [];
  return { pov, learns };
}
