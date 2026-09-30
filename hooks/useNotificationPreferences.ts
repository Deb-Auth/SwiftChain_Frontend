'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  notificationPreferencesService,
  type NotificationPreference,
  type NotificationCategory,
  type DeliveryStatusEvent,
  type EscrowActionEvent,
  type NotificationChannel,
} from '@/services/notificationPreferencesService';

export interface UseNotificationPreferencesResult {
  /** Preferences grouped by category, as fetched from the backend */
  preferences: Record<NotificationCategory, NotificationPreference[]>;
  /** True while initial preferences are being fetched */
  isLoading: boolean;
  /** Error message if fetching or saving failed */
  error: string | null;
  /** True while preferences are being persisted to the backend */
  isSaving: boolean;
  /** Update a single preference's enabled state locally */
  togglePreference: (key: string, enabled: boolean) => void;
  /** Persist all local preference changes to the backend */
  savePreferences: () => Promise<boolean>;
  /** Clear the error message */
  clearError: () => void;
}

const EMPTY_CATEGORIES: NotificationCategory[] = [
  'deliveries',
  'escrow',
  'marketing',
  'system',
];

/**
 * useNotificationPreferences — manages loading, toggling, and persisting
 * notification preferences.
 *
 * Follows the Strict Layered Architecture:
 *   NotificationPreferences (component) -> useNotificationPreferences (hook)
 *     -> notificationPreferencesService (service)
 *
 * Data comes from the backend API via the service layer — no inline mocks.
 */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<
    Record<NotificationCategory, NotificationPreference[]>
  >({
    deliveries: [],
    escrow: [],
    marketing: [],
    system: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await notificationPreferencesService.getPreferences();

      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(
          response.message ?? 'Failed to load notification preferences',
        );
      }

      const grouped: Record<
        NotificationCategory,
        NotificationPreference[]
      > = {
        deliveries: [],
        escrow: [],
        marketing: [],
        system: [],
      };

      for (const pref of response.data) {
        if (grouped[pref.category]) {
          grouped[pref.category].push(pref);
        }
      }

      setPreferences(grouped);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load notification preferences',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const togglePreference = useCallback(
    (key: string, enabled: boolean) => {
      setPreferences((prev) => {
        const next: Record<
          NotificationCategory,
          NotificationPreference[]
        > = { ...prev };
        for (const category of EMPTY_CATEGORIES) {
          next[category] = prev[category].map((pref) =>
            pref.key === key ? { ...pref, enabled } : pref,
          );
        }
        return next;
      });
    },
    [],
  );

  const savePreferences = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      const flat = EMPTY_CATEGORIES.flatMap(
        (category) => preferences[category],
      );
      const response =
        await notificationPreferencesService.updatePreferences(flat);

      if (!response.success) {
        throw new Error(
          response.message ?? 'Failed to save notification preferences',
        );
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save notification preferences',
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [preferences]);

  const clearError = useCallback(() => setError(null), []);

  // Load preferences from the backend on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreferences();
  }, [loadPreferences]);

  return useMemo(
    () => ({
      preferences,
      isLoading,
      isSaving,
      error,
      togglePreference,
      savePreferences,
      clearError,
    }),
    [
      preferences,
      isLoading,
      isSaving,
      error,
      togglePreference,
      savePreferences,
      clearError,
    ],
  );
}

export type {
  NotificationPreference,
  NotificationCategory,
  DeliveryStatusEvent,
  EscrowActionEvent,
  NotificationChannel,
};
