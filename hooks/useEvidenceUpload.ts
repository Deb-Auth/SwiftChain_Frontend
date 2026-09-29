'use client';

import { useCallback, useState } from 'react';
import { disputeResolutionService } from '@/services/disputeResolutionService';
import { useImageCompressor } from '@/hooks/useImageCompressor';
import {
  ACCEPTED_EVIDENCE_TYPES,
  MAX_EVIDENCE_FILE_SIZE_MB,
  MAX_EVIDENCE_FILES,
  type EvidenceFile,
} from '@/types/disputeResolution';

function isAcceptedType(file: File): boolean {
  return (ACCEPTED_EVIDENCE_TYPES as readonly string[]).includes(file.type);
}

function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseEvidenceUploadReturn {
  files: EvidenceFile[];
  addFiles: (incoming: File[]) => { accepted: number; rejected: string[] };
  removeFile: (id: string) => void;
  uploadAll: () => Promise<string[]>;
  isUploading: boolean;
  canAddMore: boolean;
}

/**
 * useEvidenceUpload — manages the evidence dropzone's local file queue:
 * validates type/size, compresses images before upload (via
 * useImageCompressor), and submits each file through
 * disputeResolutionService, returning the server-assigned file ids.
 */
export function useEvidenceUpload(): UseEvidenceUploadReturn {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { compress } = useImageCompressor();

  const addFiles = useCallback(
    (incoming: File[]): { accepted: number; rejected: string[] } => {
      const rejected: string[] = [];
      const accepted: EvidenceFile[] = [];

      for (const file of incoming) {
        if (!isAcceptedType(file)) {
          rejected.push(`${file.name}: unsupported file type`);
          continue;
        }
        if (!isWithinSizeLimit(file)) {
          rejected.push(`${file.name}: exceeds ${MAX_EVIDENCE_FILE_SIZE_MB}MB limit`);
          continue;
        }
        accepted.push({
          id: makeId(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'pending',
        });
      }

      setFiles((prev) => {
        const room = MAX_EVIDENCE_FILES - prev.length;
        const toAdd = accepted.slice(0, Math.max(room, 0));
        if (accepted.length > toAdd.length) {
          rejected.push(
            `Only ${MAX_EVIDENCE_FILES} files allowed — ${accepted.length - toAdd.length} file(s) not added`
          );
        }
        return [...prev, ...toAdd];
      });

      return { accepted: accepted.length, rejected };
    },
    []
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const uploadAll = useCallback(async (): Promise<string[]> => {
    setIsUploading(true);
    const fileIds: string[] = [];
    try {
      for (const evidenceFile of files) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === evidenceFile.id ? { ...f, status: 'compressing' } : f
          )
        );

        let fileToUpload = evidenceFile.file;
        let compressedSizeKB: number | undefined;
        if (evidenceFile.file.type.startsWith('image/')) {
          try {
            fileToUpload = await compress(evidenceFile.file);
            compressedSizeKB = Math.round(fileToUpload.size / 1024);
          } catch {
            // Fall back to the original file if compression fails —
            // uploading the uncompressed image beats blocking the dispute.
            fileToUpload = evidenceFile.file;
          }
        }

        try {
          const { fileId } = await disputeResolutionService.uploadEvidence(
            fileToUpload
          );
          fileIds.push(fileId);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === evidenceFile.id
                ? { ...f, status: 'ready', compressedSizeKB }
                : f
            )
          );
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === evidenceFile.id
                ? {
                    ...f,
                    status: 'error',
                    errorMessage:
                      err instanceof Error ? err.message : 'Upload failed',
                  }
                : f
            )
          );
          throw err;
        }
      }
      return fileIds;
    } finally {
      setIsUploading(false);
    }
  }, [files, compress]);

  return {
    files,
    addFiles,
    removeFile,
    uploadAll,
    isUploading,
    canAddMore: files.length < MAX_EVIDENCE_FILES,
  };
}
