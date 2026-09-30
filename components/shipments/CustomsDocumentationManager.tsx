'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useCustomsDocs,
  type CustomsDocument,
  type CustomsDocumentUpload,
} from '@/hooks/useCustomsDocs';

interface CustomsDocumentationManagerProps {
  shipmentId: string;
  readonly?: boolean;
  autoValidate?: boolean;
  className?: string;
}

const DOCUMENT_TYPE_LABELS: Record<CustomsDocument['documentType'], string> = {
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  certificate_of_origin: 'Certificate of Origin',
  export_declaration: 'Export Declaration',
  import_permit: 'Import Permit',
  customs_declaration: 'Customs Declaration',
  other: 'Other',
};

const DOCUMENT_TYPE_OPTIONS: CustomsDocument['documentType'][] = [
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
  'export_declaration',
  'import_permit',
  'customs_declaration',
  'other',
];

/**
 * CustomsDocumentationManager — Interface for managing cross-border customs documentation.
 * Provides upload, validation, status tracking, and compliance checking for customs documents.
 */
export function CustomsDocumentationManager({
  shipmentId,
  readonly = false,
  autoValidate = true,
  className,
}: CustomsDocumentationManagerProps) {
  const [selectedType, setSelectedType] = useState<CustomsDocument['documentType']>('commercial_invoice');
  const [documentNumber, setDocumentNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    documents,
    isLoading,
    isError,
    validationResult,
    isValidating,
    isUploading,
    uploadProgress,
    uploadDocument,
    deleteDocument,
    updateDocumentStatus,
    validateDocuments,
    refreshDocuments,
    getDocumentsByType,
  } = useCustomsDocs({ shipmentId, autoValidate });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    const upload: CustomsDocumentUpload = {
      shipmentId,
      documentType: selectedType,
      file: selectedFile,
      documentNumber: documentNumber || undefined,
      notes: notes || undefined,
    };

    try {
      await uploadDocument(upload);
      setSelectedFile(null);
      setDocumentNumber('');
      setNotes('');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }, [selectedFile, shipmentId, selectedType, documentNumber, notes, uploadDocument]);

  const handleDelete = useCallback(
    async (documentId: string) => {
      if (confirm('Are you sure you want to delete this document?')) {
        await deleteDocument(documentId);
      }
    },
    [deleteDocument]
  );

  const handleStatusUpdate = useCallback(
    async (documentId: string, status: CustomsDocument['status']) => {
      await updateDocumentStatus(documentId, status);
    },
    [updateDocumentStatus]
  );

  const getStatusIcon = (status: CustomsDocument['status']) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: CustomsDocument['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
          styles[status]
        )}
      >
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className={clsx('rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900', className)}>
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Customs Documentation
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage cross-border shipping documents and compliance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => validateDocuments()}
              disabled={isValidating}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={clsx('h-4 w-4', isValidating && 'animate-spin')} />
              Validate
            </button>
            <button
              onClick={refreshDocuments}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Validation Results */}
        {validationResult && (
          <div className={clsx(
            'mb-6 rounded-lg border p-4',
            validationResult.isValid
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          )}>
            <div className="flex items-start gap-3">
              {validationResult.isValid ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              <div className="flex-1">
                <h3 className={clsx(
                  'font-semibold',
                  validationResult.isValid
                    ? 'text-green-900 dark:text-green-100'
                    : 'text-red-900 dark:text-red-100'
                )}>
                  {validationResult.isValid ? 'All Required Documents Submitted' : 'Documentation Incomplete'}
                </h3>
                {validationResult.missingDocuments.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Missing Documents:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-red-600 dark:text-red-400">
                      {validationResult.missingDocuments.map((type) => (
                        <li key={type}>{DOCUMENT_TYPE_LABELS[type]}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {validationResult.warnings.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Warnings:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-yellow-600 dark:text-yellow-400">
                      {validationResult.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {validationResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Errors:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-red-600 dark:text-red-400">
                      {validationResult.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upload Form */}
        {!readonly && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 font-semibold text-slate-900 dark:text-white">Upload Document</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Document Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as CustomsDocument['documentType'])}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  {DOCUMENT_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {DOCUMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Document Number (Optional)
                </label>
                <input
                  type="text"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="e.g., INV-2024-001"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any relevant notes about this document..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  File
                </label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-slate-400 dark:file:bg-blue-900/30 dark:file:text-blue-400"
                />
                {selectedFile && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-4 w-4" />
                {isUploading ? `Uploading... ${uploadProgress}%` : 'Upload Document'}
              </button>
            </div>
          </div>
        )}

        {/* Documents List */}
        <div>
          <h3 className="mb-4 font-semibold text-slate-900 dark:text-white">Uploaded Documents</h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              Failed to load documents. Please try refreshing.
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800">
              <FileText className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">No documents uploaded</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Upload customs documentation to proceed with shipment
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-slate-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-white">{doc.fileName}</p>
                        {getStatusBadge(doc.status)}
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {DOCUMENT_TYPE_LABELS[doc.documentType]}
                        {doc.documentNumber && ` • ${doc.documentNumber}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                      {doc.notes && (
                        <p className="mt-2 text-sm italic text-slate-600 dark:text-slate-400">{doc.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(doc.fileUrl, '_blank')}
                      className="rounded p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                      title="View document"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {!readonly && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="rounded p-2 text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                        title="Delete document"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
