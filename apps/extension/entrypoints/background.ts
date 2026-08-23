import { supabase } from '../lib/supabase';

export default defineBackground(() => {
  supabase.auth.startAutoRefresh();
});
