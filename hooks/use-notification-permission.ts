import { useEffect, useState } from 'react';

import {
  type PermissionStatus,
  getCurrentPermissionStatus,
  subscribeToPermissionStatus,
} from '@/lib/notifications/permissions';

export function useNotificationPermission(): PermissionStatus {
  const [status, setStatus] = useState<PermissionStatus>(getCurrentPermissionStatus);
  useEffect(() => {
    return subscribeToPermissionStatus(setStatus);
  }, []);
  return status;
}
