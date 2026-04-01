import {
  isCreatePackageSuccess,
  isCreatePackageError,
  isUpdatePackageSuccess,
  isPackageActionSuccess,
  isApiError,
  PACKAGE_STATUS,
} from './package.models';
import type {
  CreatePackageApiResponse,
  UpdatePackageApiResponse,
  PackageActionApiResponse,
  Package,
} from './package.models';

const mockPackage: Package = {
  id: 'pkg-1',
  reference: 'REF-001',
  receiver_email: 'test@example.com',
  notes: null,
  status: PACKAGE_STATUS.PENDING,
  created_at: '2026-01-01T00:00:00Z',
};

describe('package.models type guards', () => {
  describe('isCreatePackageSuccess', () => {
    it('should return true for a response containing a package', () => {
      const response: CreatePackageApiResponse = {
        package: mockPackage,
        email_sent: true,
        email_error: null,
      };
      expect(isCreatePackageSuccess(response)).toBe(true);
    });

    it('should return false for an error response', () => {
      const response: CreatePackageApiResponse = { error: 'Something went wrong' };
      expect(isCreatePackageSuccess(response)).toBe(false);
    });
  });

  describe('isCreatePackageError', () => {
    it('should return true for a response with an error field', () => {
      const response: CreatePackageApiResponse = { error: 'Bad request', details: 'Email invalid' };
      expect(isCreatePackageError(response)).toBe(true);
    });

    it('should return false for a success response', () => {
      const response: CreatePackageApiResponse = {
        package: mockPackage,
        email_sent: false,
        email_error: null,
      };
      expect(isCreatePackageError(response)).toBe(false);
    });
  });

  describe('isUpdatePackageSuccess', () => {
    it('should return true for a response containing a package', () => {
      const response: UpdatePackageApiResponse = { package: mockPackage };
      expect(isUpdatePackageSuccess(response)).toBe(true);
    });

    it('should return false for an error response', () => {
      const response: UpdatePackageApiResponse = { error: 'Package not found' };
      expect(isUpdatePackageSuccess(response)).toBe(false);
    });
  });

  describe('isPackageActionSuccess', () => {
    it('should return true for a response containing a package', () => {
      const response: PackageActionApiResponse = {
        package: mockPackage,
        email_sent: true,
        email_error: null,
      };
      expect(isPackageActionSuccess(response)).toBe(true);
    });

    it('should return false for an error response', () => {
      const response: PackageActionApiResponse = { error: 'Unauthorized' };
      expect(isPackageActionSuccess(response)).toBe(false);
    });
  });

  describe('isApiError', () => {
    it('should return true for an object with an error field', () => {
      expect(isApiError({ error: 'Something went wrong' })).toBe(true);
    });

    it('should return true for an error object with details', () => {
      expect(isApiError({ error: 'Bad request', details: 'Email invalid' })).toBe(true);
    });

    it('should return false for a success response object', () => {
      expect(isApiError({ package: mockPackage, email_sent: true, email_error: null })).toBe(false);
    });

    it('should return false for null', () => {
      expect(isApiError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isApiError(undefined)).toBe(false);
    });

    it('should return false for a primitive string', () => {
      expect(isApiError('error string')).toBe(false);
    });

    it('should return false for a number', () => {
      expect(isApiError(42)).toBe(false);
    });

    it('should return false for an empty object', () => {
      expect(isApiError({})).toBe(false);
    });
  });

  describe('PACKAGE_STATUS constants', () => {
    it('should have all expected status values', () => {
      expect(PACKAGE_STATUS.PENDING).toBe('pending');
      expect(PACKAGE_STATUS.NOTIFIED).toBe('notified');
      expect(PACKAGE_STATUS.IN_TRANSIT).toBe('in_transit');
      expect(PACKAGE_STATUS.READY_FOR_COLLECTION).toBe('ready_for_collection');
      expect(PACKAGE_STATUS.DELIVERED).toBe('delivered');
      expect(PACKAGE_STATUS.COLLECTED).toBe('collected');
    });
  });
});
