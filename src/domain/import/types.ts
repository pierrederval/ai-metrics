export type ImportState =
  'queued' | 'discovering' | 'importing' | 'complete' | 'partial' | 'failed';
export type ItemState = 'pending' | 'complete' | 'failed';
export interface ImportSnapshot {
  id: string;
  repositoryId: string;
  state: ImportState;
  total: number | null;
  completed: number;
  failed: number;
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
}
export interface ImportItem {
  number: number;
  state: ItemState;
}
export interface ImportExecution {
  snapshot: ImportSnapshot;
  items: ImportItem[];
}
export type StartResult = { run?: ImportSnapshot; error?: string };
export class ImportRequestError extends Error {}
export type RepositoryChoice = {
  id: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  canAdmin: boolean;
};
