'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  UploadPipeline,
  type UploadCategory,
  type UploadPipelineOptions,
  type UploadQueueState,
  type UploadRejection,
} from '@/lib/uploadPipeline';

export interface UseUploadPipelineResult extends UploadQueueState {
  /** Validate and queue files; invalid files are returned as rejections. */
  addFiles: (files: File[], category: UploadCategory) => UploadRejection[];
  /** Upload everything currently queued. */
  startUploads: () => Promise<void>;
  retry: (id: string) => Promise<boolean>;
  retryFailed: () => Promise<number>;
  cancel: (id: string) => boolean;
  remove: (id: string) => boolean;
  clearCompleted: () => void;
  /** Counts per status for progress UIs. */
  counts: { queued: number; active: number; success: number; error: number };
}

/**
 * useUploadPipeline -- React binding for UploadPipeline.
 * Component -> useUploadPipeline -> UploadPipeline -> uploadService
 */
export function useUploadPipeline(options?: UploadPipelineOptions): UseUploadPipelineResult {
  const [pipeline] = useState(() => new UploadPipeline(options));

  const state = useSyncExternalStore(
    useCallback((onChange: () => void) => pipeline.subscribe(onChange), [pipeline]),
    () => pipeline.getState(),
    () => pipeline.getState(),
  );

  const addFiles = useCallback(
    (files: File[], category: UploadCategory) => pipeline.enqueue(files, category).rejected,
    [pipeline],
  );
  const startUploads = useCallback(() => pipeline.start(), [pipeline]);
  const retry = useCallback((id: string) => pipeline.retry(id), [pipeline]);
  const retryFailed = useCallback(() => pipeline.retryFailed(), [pipeline]);
  const cancel = useCallback((id: string) => pipeline.cancel(id), [pipeline]);
  const remove = useCallback((id: string) => pipeline.remove(id), [pipeline]);
  const clearCompleted = useCallback(() => pipeline.clearCompleted(), [pipeline]);

  const counts = useMemo(
    () => ({
      queued: state.items.filter((i) => i.status === 'queued').length,
      active: state.items.filter((i) => i.status === 'uploading' || i.status === 'retrying').length,
      success: state.items.filter((i) => i.status === 'success').length,
      error: state.items.filter((i) => i.status === 'error').length,
    }),
    [state.items],
  );

  return {
    ...state,
    counts,
    addFiles,
    startUploads,
    retry,
    retryFailed,
    cancel,
    remove,
    clearCompleted,
  };
}
