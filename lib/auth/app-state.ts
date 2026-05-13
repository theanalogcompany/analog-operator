import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export function wireAuthAutoRefresh(): () => void {
  const handleChange = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  handleChange(AppState.currentState);
  const subscription = AppState.addEventListener('change', handleChange);

  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
  };
}
