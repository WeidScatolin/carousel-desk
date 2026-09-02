import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockUploadStream, mockDestroy } = vi.hoisted(() => ({
  mockUploadStream: vi.fn(),
  mockDestroy: vi.fn(),
}));

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: mockUploadStream,
      destroy: mockDestroy,
    },
  },
}));

import { uploadSlideImage, deleteSlideImage } from './cloudinary';

describe('uploadSlideImage', () => {
  beforeEach(() => {
    mockUploadStream.mockReset();
  });

  test('resolves with the secure URL and public ID on success', async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      callback(null, {
        secure_url: 'https://cloudinary.test/img.png',
        public_id: 'carousel-desk/slides/abc',
      });
      return { end: vi.fn() };
    });

    const result = await uploadSlideImage(Buffer.from('fake-png'), 'abc');

    expect(result).toEqual({
      url: 'https://cloudinary.test/img.png',
      publicId: 'carousel-desk/slides/abc',
    });
  });

  test('rejects when Cloudinary returns an error', async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      callback(new Error('upload failed'), null);
      return { end: vi.fn() };
    });

    await expect(uploadSlideImage(Buffer.from('fake-png'), 'abc')).rejects.toThrow('upload failed');
  });
});

describe('deleteSlideImage', () => {
  test('calls Cloudinary destroy with the public ID', async () => {
    mockDestroy.mockResolvedValue({ result: 'ok' });

    await deleteSlideImage('carousel-desk/slides/abc');

    expect(mockDestroy).toHaveBeenCalledWith('carousel-desk/slides/abc');
  });
});
