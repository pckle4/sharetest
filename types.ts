export interface SharedFileEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File; // Only present on sender side
}

export interface SharedSession {
  sessionId: string;
  files: SharedFileEntry[];
  totalSize: number;
  createdAt: number;
  expiresAt: number;
  shareUrl: string;
}

export enum TransferState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  WAITING = 'WAITING',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type FileDownloadStatus = 'idle' | 'queued' | 'downloading' | 'completed' | 'saved';

export interface FileProgress {
  transferred: number;
  total: number;
  percentage: number;
  speed: string;
  blobUrl?: string;
  status: FileDownloadStatus;
}

export interface ManifestMsg {
  type: 'MANIFEST';
  files: Omit<SharedFileEntry, 'file'>[];
  totalSize: number;
}
