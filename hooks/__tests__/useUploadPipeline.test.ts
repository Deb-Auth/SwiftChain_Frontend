import { act, renderHook } from '@testing-library/react';
import { useUploadPipeline } from '@/hooks/useUploadPipeline';

jest.mock('@/services/uploadService', () => ({
  uploadService: { validateFile: jest.fn(() => []), uploadFile: jest.fn() },
}));

const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const okResponse = {
  success: true,
  data: { fileId: 'f1', fileName: 'a', fileSize: 1, mimeType: 'image/png', uploadedAt: '' },
};

describe('useUploadPipeline', () => {
  it('exposes queue state, counts and drives uploads', async () => {
    const upload = jest.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() =>
      useUploadPipeline({ upload, sleep: () => Promise.resolve() }),
    );

    let rejected: unknown[] = [];
    act(() => {
      rejected = result.current.addFiles([file('a.png'), file('b.png')], 'kyc');
    });
    expect(rejected).toEqual([]);
    expect(result.current.counts).toEqual({ queued: 2, active: 0, success: 0, error: 0 });

    await act(async () => {
      await result.current.startUploads();
    });
    expect(result.current.counts).toEqual({ queued: 0, active: 0, success: 2, error: 0 });
    expect(result.current.isProcessing).toBe(false);
  });

  it('surfaces failures and allows retryFailed', async () => {
    const upload = jest
      .fn()
      .mockResolvedValueOnce({ success: false, message: 'bad' })
      .mockResolvedValueOnce(okResponse);
    const { result } = renderHook(() =>
      useUploadPipeline({ upload, maxAttempts: 1, sleep: () => Promise.resolve() }),
    );
    act(() => {
      result.current.addFiles([file('a.png')], 'proof');
    });
    await act(async () => {
      await result.current.startUploads();
    });
    expect(result.current.counts.error).toBe(1);
    expect(result.current.items[0].error).toBe('bad');

    await act(async () => {
      await result.current.retryFailed();
    });
    expect(result.current.counts).toMatchObject({ error: 0, success: 1 });
  });

  it('returns rejections for invalid files', () => {
    const validate = jest.fn(() => [{ field: 'size' as const, message: 'too big' }]);
    const { result } = renderHook(() => useUploadPipeline({ validate }));
    let rejected: { errors: { message: string }[] }[] = [];
    act(() => {
      rejected = result.current.addFiles([file('a.png')], 'kyc');
    });
    expect(rejected[0].errors[0].message).toBe('too big');
    expect(result.current.items).toHaveLength(0);
  });
});
