import {
  uploadService,
  type FileUploadError,
  type FileUploadResponse,
} from '@/services/uploadService';

export type UploadCategory = 'kyc' | 'license' | 'proof';

export type UploadItemStatus =
  | 'queued'
  | 'uploading'
  | 'retrying'
  | 'success'
  | 'error'
  | 'cancelled';

export interface UploadItem {
  id: string;
  file: File;
  category: UploadCategory;
  status: UploadItemStatus;
  /** Number of upload attempts started so far. */
  attempts: number;
  fileId?: string;
  error?: string;
}

export interface UploadQueueState {
  items: UploadItem[];
  /** True while the pipeline is processing the queue. */
  isProcessing: boolean;
}

export interface UploadRejection {
  file: File;
  errors: FileUploadError[];
}

export interface UploadPipelineOptions {
  /** Upload attempts per file, including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay for exponential backoff in ms. Default 500. */
  retryDelayMs?: number;
  /** Files uploaded in parallel. Default 2. */
  concurrency?: number;
  /** Injectable for tests and alternate backends. */
  upload?: (file: File, category: UploadCategory) => Promise<FileUploadResponse>;
  /** Injectable validator; defaults to uploadService.validateFile. */
  validate?: (file: File) => FileUploadError[];
  /** Injectable sleep so tests do not wait on real timers. */
  sleep?: (ms: number) => Promise<void>;
}

type Listener = (state: UploadQueueState) => void;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let idCounter = 0;
const nextId = () => `upload-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * Framework-agnostic upload pipeline: validates files, queues them, uploads
 * with bounded concurrency, retries failures with exponential backoff, and
 * exposes immutable queue-state snapshots through subscribe().
 */
export class UploadPipeline {
  private state: UploadQueueState = { items: [], isProcessing: false };
  private listeners = new Set<Listener>();
  private runPromise: Promise<void> | null = null;

  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly concurrency: number;
  private readonly upload: NonNullable<UploadPipelineOptions['upload']>;
  private readonly validate: NonNullable<UploadPipelineOptions['validate']>;
  private readonly sleep: NonNullable<UploadPipelineOptions['sleep']>;

  constructor(options: UploadPipelineOptions = {}) {
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 500);
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
    this.upload = options.upload ?? ((file, category) => uploadService.uploadFile(file, category));
    this.validate = options.validate ?? ((file) => uploadService.validateFile(file));
    this.sleep = options.sleep ?? defaultSleep;
  }

  getState(): UploadQueueState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Validates files and queues the valid ones. Invalid files are returned, not queued. */
  enqueue(
    files: File[],
    category: UploadCategory,
  ): { accepted: UploadItem[]; rejected: UploadRejection[] } {
    const accepted: UploadItem[] = [];
    const rejected: UploadRejection[] = [];

    for (const file of files) {
      const errors = this.validate(file);
      if (errors.length > 0) {
        rejected.push({ file, errors });
        continue;
      }
      accepted.push({ id: nextId(), file, category, status: 'queued', attempts: 0 });
    }

    if (accepted.length > 0) {
      this.setState({ items: [...this.state.items, ...accepted] });
    }
    return { accepted, rejected };
  }

  /** Processes all queued items. Concurrent calls share one run. */
  start(): Promise<void> {
    if (this.runPromise) return this.runPromise;
    this.setState({ isProcessing: true });
    this.runPromise = this.drain().finally(() => {
      this.runPromise = null;
      this.setState({ isProcessing: false });
    });
    return this.runPromise;
  }

  /** Re-queues a failed item and processes it. Resolves false if the item is not retryable. */
  async retry(id: string): Promise<boolean> {
    const item = this.find(id);
    if (!item || (item.status !== 'error' && item.status !== 'cancelled')) return false;
    this.patch(id, { status: 'queued', attempts: 0, error: undefined });
    // An in-flight run's workers may already have exited; start a fresh run after it.
    if (this.runPromise) await this.runPromise;
    await this.start();
    return true;
  }

  /** Re-queues every failed item. Returns how many were re-queued. */
  async retryFailed(): Promise<number> {
    const failedCount = this.state.items.filter((i) => i.status === 'error').length;
    if (failedCount === 0) return 0;
    this.setState({
      items: this.state.items.map((i) =>
        i.status === 'error'
          ? { ...i, status: 'queued' as const, attempts: 0, error: undefined }
          : i,
      ),
    });
    if (this.runPromise) await this.runPromise;
    await this.start();
    return failedCount;
  }

  /** Cancels a queued item. Items already uploading cannot be aborted. */
  cancel(id: string): boolean {
    const item = this.find(id);
    if (!item || item.status !== 'queued') return false;
    this.patch(id, { status: 'cancelled' });
    return true;
  }

  /** Removes an item that is not currently in flight. */
  remove(id: string): boolean {
    const item = this.find(id);
    if (!item || item.status === 'uploading' || item.status === 'retrying') return false;
    this.setState({ items: this.state.items.filter((i) => i.id !== id) });
    return true;
  }

  /** Drops finished (success/cancelled) items, keeping failures visible. */
  clearCompleted(): void {
    this.setState({
      items: this.state.items.filter((i) => i.status !== 'success' && i.status !== 'cancelled'),
    });
  }

  private async drain(): Promise<void> {
    const worker = async () => {
      for (;;) {
        const next = this.state.items.find((i) => i.status === 'queued');
        if (!next) return;
        // Claim synchronously so parallel workers never take the same item.
        this.patch(next.id, { status: 'uploading' });
        await this.processItem(next.id);
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, worker));
  }

  private async processItem(id: string): Promise<void> {
    let lastError = 'Upload failed';

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const item = this.find(id);
      if (!item) return;
      this.patch(id, { status: attempt === 1 ? 'uploading' : 'retrying', attempts: attempt });

      try {
        const response = await this.upload(item.file, item.category);
        if (response.success) {
          this.patch(id, { status: 'success', fileId: response.data?.fileId, error: undefined });
          return;
        }
        lastError = response.message ?? lastError;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }

      if (attempt < this.maxAttempts) {
        await this.sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }

    this.patch(id, { status: 'error', error: lastError });
  }

  private find(id: string): UploadItem | undefined {
    return this.state.items.find((i) => i.id === id);
  }

  private patch(id: string, changes: Partial<UploadItem>): void {
    this.setState({
      items: this.state.items.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    });
  }

  private setState(changes: Partial<UploadQueueState>): void {
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener(this.state));
  }
}
