import Dexie, { type EntityTable } from 'dexie';
import type { Guide, NarrationSegment, Screenshot, Snapshot, Step } from './types';

export class MimikDB extends Dexie {
  guides!: EntityTable<Guide, 'id'>;
  steps!: EntityTable<Step, 'id'>;
  screenshots!: EntityTable<Screenshot, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  narration!: EntityTable<NarrationSegment, 'id'>;

  constructor() {
    super('mimik');
    this.version(1).stores({
      guides: 'id, createdAt, updatedAt, starred, deletedAt',
      steps: 'id, guideId, index',
      screenshots: 'id, stepId',
    });
    this.version(2).stores({
      snapshots: 'id, guideId, createdAt, [guideId+createdAt]',
    });
    this.version(3).stores({
      narration: 'id, guideId, stepId, [guideId+startMs]',
    });
  }
}

export const db = new MimikDB();
