import { UploadPipeline, type UploadCategory } from '@/lib/uploadPipeline';
import type { FileUploadResponse } from '@/services/uploadService';

jest.mock('@/services/uploadService', () => ({
  uploadService: { validateFile: jest.fn(() => []), uploadFile: jest.fn() },
}));

const makeFile = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });
const ok = (fileId = 'f1'): FileUploadResponse => ({
  success: true,
  data: { fileId, fileName: 'a', fileSize: 1, mimeType: 'image/png', uploadedAt: '' },
});
const fail = (message = 'boom'): FileUploadResponse => ({ success: false, message });

const build = (
  upload: (f: File, c: UploadCategory) => Promise<FileUploadResponse>,
  extra: Partial<ConstructorParameters<typeof UploadPipeline>[0]> = {},
) => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  return { sleep, pipeline: new UploadPipeline({ upload, sleep, retryDelayMs: 100, ...extra }) };
};

describe('UploadPipeline', () => {
  it('rejects invalid files without queueing them', () => {
    const validate = jest.fn((f: File) =>
      f.name === 'bad.exe' ? [{ field: 'type' as const, message: 'nope' }] : [],
    );
    const { pipeline } = build(jest.fn(), { validate });
    const { accepted, rejected } = pipeline.enqueue([makeFile('a.png'), makeFile('bad.exe')], 'kyc');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errors[0].message).toBe('nope');
    expect(pipeline.getState().items).toHaveLength(1);
  });

  it('uploads queued files and records the file id', async () => {
    const upload = jest.fn().mockResolvedValue(ok('id-9'));
    const { pipeline } = build(upload);
    pipeline.enqueue([makeFile()], 'proof');
    await pipeline.start();
    const [item] = pipeline.getState().items;
    expect(item).toMatchObject({ status: 'success', fileId: 'id-9', attempts: 1 });
    expect(upload).toHaveBeenCalledWith(expect.any(File), 'proof');
    expect(pipeline.getState().isProcessing).toBe(false);
  });

  it('retries with exponential backoff and then succeeds', async () => {
    const upload = jest
      .fn()
      .mockResolvedValueOnce(fail())
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(ok());
    const { pipeline, sleep } = build(upload);
    pipeline.enqueue([makeFile()], 'kyc');
    await pipeline.start();
    expect(pipeline.getState().items[0]).toMatchObject({ status: 'success', attempts: 3 });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('marks the item as error after exhausting attempts', async () => {
    const upload = jest.fn().mockResolvedValue(fail('server down'));
    const { pipeline, sleep } = build(upload, { maxAttempts: 2 });
    pipeline.enqueue([makeFile()], 'kyc');
    await pipeline.start();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(pipeline.getState().items[0]).toMatchObject({ status: 'error', error: 'server down' });
  });

  it('retry() re-queues a failed item and uploads it again', async () => {
    const upload = jest.fn().mockResolvedValueOnce(fail()).mockResolvedValueOnce(ok('again'));
    const { pipeline } = build(upload, { maxAttempts: 1 });
    pipeline.enqueue([makeFile()], 'kyc');
    await pipeline.start();
    const { id } = pipeline.getState().items[0];
    expect(await pipeline.retry(id)).toBe(true);
    expect(pipeline.getState().items[0]).toMatchObject({ status: 'success', fileId: 'again', attempts: 1 });
    expect(await pipeline.retry(id)).toBe(false);
  });

  it('retryFailed() re-queues only failed items', async () => {
    const upload = jest
      .fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok());
    const { pipeline } = build(upload, { maxAttempts: 1, concurrency: 1 });
    pipeline.enqueue([makeFile('a.png'), makeFile('b.png')], 'kyc');
    await pipeline.start();
    expect(await pipeline.retryFailed()).toBe(1);
    expect(pipeline.getState().items.map((i) => i.status)).toEqual(['success', 'success']);
    expect(await pipeline.retryFailed()).toBe(0);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const upload = jest.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return ok();
    });
    const { pipeline } = build(upload, { concurrency: 2 });
    pipeline.enqueue([1, 2, 3, 4, 5].map((n) => makeFile(`${n}.png`)), 'kyc');
    await pipeline.start();
    expect(peak).toBe(2);
    expect(pipeline.getState().items.every((i) => i.status === 'success')).toBe(true);
    expect(upload).toHaveBeenCalledTimes(5);
  });

  it('cancels queued items so they are not uploaded', async () => {
    const upload = jest.fn().mockResolvedValue(ok());
    const { pipeline } = build(upload);
    pipeline.enqueue([makeFile('a.png'), makeFile('b.png')], 'kyc');
    const [first] = pipeline.getState().items;
    expect(pipeline.cancel(first.id)).toBe(true);
    await pipeline.start();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(pipeline.getState().items[0].status).toBe('cancelled');
  });

  it('shares one run between concurrent start() calls', async () => {
    const upload = jest.fn().mockResolvedValue(ok());
    const { pipeline } = build(upload);
    pipeline.enqueue([makeFile()], 'kyc');
    await Promise.all([pipeline.start(), pipeline.start()]);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('removes idle items and clears completed ones, keeping failures', async () => {
    const upload = jest.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail());
    const { pipeline } = build(upload, { maxAttempts: 1, concurrency: 1 });
    pipeline.enqueue([makeFile('a.png'), makeFile('b.png')], 'kyc');
    await pipeline.start();
    pipeline.clearCompleted();
    const remaining = pipeline.getState().items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('error');
    expect(pipeline.remove(remaining[0].id)).toBe(true);
    expect(pipeline.getState().items).toHaveLength(0);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { pipeline } = build(jest.fn());
    const listener = jest.fn();
    const unsubscribe = pipeline.subscribe(listener);
    pipeline.enqueue([makeFile()], 'kyc');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    pipeline.enqueue([makeFile()], 'kyc');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
