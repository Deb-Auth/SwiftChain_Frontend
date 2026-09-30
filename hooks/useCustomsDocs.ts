'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './useToast';

export interface CustomsDocument {
  id: string;
  shipmentId: string;
  documentType:
    | 'commercial_invoice'
    | 'packing_list'
    | 'certificate_of_origin'
    | 'export_declaration'
    | 'import_permit'
    | 'customs_declaration'
    | 'other';
  documentNumber?: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  metadata?: Record<string, any>;
}

export interface CustomsDocumentUpload {
  shipmentId: string;
  documentType: CustomsDocument['documentType'];
  file: File;
  documentNumber?: string;
  notes?: string;
}

export interface CustomsValidationResult {
  isValid: boolean;
  missingDocuments: CustomsDocument['documentType'][];
  warnings: string[];
  errors: string[];
}

interface UseCustomsDocsProps {
  shipmentId: string;
  autoValidate?: boolean;
}

interface UseCustomsDocsReturn {
  documents: CustomsDocument[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  validationResult: CustomsValidationResult | null;
  isValidating: boolean;
  isUploading: boolean;
  uploadProgress: number;

  uploadDocument: (upload: CustomsDocumentUpload) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  updateDocumentStatus: (
    documentId: string,
    status: CustomsDocument['status'],
    notes?: string
  ) => Promise<void>;
  validateDocuments: () => Promise<void>;
  refreshDocuments: () => void;
  getDocumentsByType: (
    type: CustomsDocument['documentType']
  ) => CustomsDocument[];
}

/**
 * useCustomsDocs — Custom hook for managing customs documentation.
 * Handles document upload, validation, status updates, and compliance checks.
 * Follows the Strict Layered Architecture: Component -> Hook -> Service.
 */
export function useCustomsDocs({
  shipmentId,
  autoValidate = true,
}: UseCustomsDocsProps): UseCustomsDocsReturn {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<CustomsValidationResult | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customs documents for the shipment
  const {
    data: documents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CustomsDocument[], Error>({
    queryKey: ['customs-documents', shipmentId],
    queryFn: async () => {
      // TODO: Replace with actual API call
      // const response = await customsService.getDocuments(shipmentId);
      // return response.data;

      // Mock implementation for now
      return [];
    },
    enabled: Boolean(shipmentId),
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (upload: CustomsDocumentUpload) => {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        formData.append('file', upload.file);
        formData.append('shipmentId', upload.shipmentId);
        formData.append('documentType', upload.documentType);
        if (upload.documentNumber) {
          formData.append('documentNumber', upload.documentNumber);
        }
        if (upload.notes) {
          formData.append('notes', upload.notes);
        }

        // TODO: Replace with actual API call
        // const response = await customsService.uploadDocument(
        //   formData,
        //   (progressEvent: any) => {
        //     const progress = Math.round(
        //       (progressEvent.loaded / progressEvent.total) * 100
        //     );
        //     setUploadProgress(progress);
        //   }
        // );
        // return response.data;

        // Mock implementation
        return new Promise<CustomsDocument>((resolve) => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += 10;
            setUploadProgress(progress);
            if (progress >= 100) {
              clearInterval(interval);
              resolve({
                id: `doc-${Date.now()}`,
                shipmentId: upload.shipmentId,
                documentType: upload.documentType,
                documentNumber: upload.documentNumber,
                fileName: upload.file.name,
                fileUrl: URL.createObjectURL(upload.file),
                fileSize: upload.file.size,
                uploadedAt: new Date().toISOString(),
                status: 'pending',
                notes: upload.notes,
              });
            }
          }, 200);
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['customs-documents', shipmentId],
      });

      toast({
        title: 'Upload Successful',
        description: 'Customs document uploaded successfully',
        variant: 'default',
      });

      if (autoValidate) {
        void validateDocuments();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload customs document',
        variant: 'destructive',
      });
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      // TODO: Replace with actual API call
      // await customsService.deleteDocument(documentId);

      // Mock implementation
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['customs-documents', shipmentId],
      });

      toast({
        title: 'Document Deleted',
        description: 'Customs document removed successfully',
        variant: 'default',
      });

      if (autoValidate) {
        void validateDocuments();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  // Update document status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      documentId,
      status,
      notes,
    }: {
      documentId: string;
      status: CustomsDocument['status'];
      notes?: string;
    }) => {
      // TODO: Replace with actual API call
      // await customsService.updateDocumentStatus(documentId, status, notes);

      // Mock implementation
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['customs-documents', shipmentId],
      });

      toast({
        title: 'Status Updated',
        description: 'Document status updated successfully',
        variant: 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update document status',
        variant: 'destructive',
      });
    },
  });

  // Validate documents
  const validateDocuments = useCallback(async () => {
    setIsValidating(true);

    try {
      // TODO: Replace with actual API call
      // const response = await customsService.validateDocuments(shipmentId);
      // setValidationResult(response.data);

      // Mock validation logic
      const requiredDocs: CustomsDocument['documentType'][] = [
        'commercial_invoice',
        'packing_list',
        'certificate_of_origin',
      ];

      const existingTypes = new Set(
        documents.map((doc) => doc.documentType)
      );
      const missingDocuments = requiredDocs.filter(
        (type) => !existingTypes.has(type)
      );

      const warnings: string[] = [];
      const errors: string[] = [];

      // Check for pending documents
      const pendingDocs = documents.filter((doc) => doc.status === 'pending');
      if (pendingDocs.length > 0) {
        warnings.push(
          `${pendingDocs.length} document(s) pending approval`
        );
      }

      // Check for rejected documents
      const rejectedDocs = documents.filter(
        (doc) => doc.status === 'rejected'
      );
      if (rejectedDocs.length > 0) {
        errors.push(
          `${rejectedDocs.length} document(s) rejected - resubmission required`
        );
      }

      const result: CustomsValidationResult = {
        isValid: missingDocuments.length === 0 && errors.length === 0,
        missingDocuments,
        warnings,
        errors,
      };

      setValidationResult(result);
    } catch (error: any) {
      toast({
        title: 'Validation Failed',
        description:
          error.message || 'Failed to validate customs documents',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  }, [documents, shipmentId, toast]);

  // Get documents by type
  const getDocumentsByType = useCallback(
    (type: CustomsDocument['documentType']) => {
      return documents.filter((doc) => doc.documentType === type);
    },
    [documents]
  );

  return {
    documents,
    isLoading,
    isError,
    error: error as Error | null,
    validationResult,
    isValidating,
    isUploading,
    uploadProgress,
    uploadDocument: uploadMutation.mutateAsync,
    deleteDocument: deleteMutation.mutateAsync,
    updateDocumentStatus: async (documentId, status, notes) => {
      await updateStatusMutation.mutateAsync({ documentId, status, notes });
    },
    validateDocuments,
    refreshDocuments: refetch,
    getDocumentsByType,
  };
}
