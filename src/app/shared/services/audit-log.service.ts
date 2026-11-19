import { Injectable } from '@angular/core';
import { supabase } from '../../../environments/supabase.config';

export interface AuditLogEntry {
  actionType: 'create' | 'update' | 'delete';
  tableName: string;
  recordId: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  /** Record an admin CRUD action in the audit log. Best-effort: never throws
   *  to the caller, so a logging failure never blocks the main operation. */
  async logActivity(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser() as { data: { user: any } };

      const { error } = await supabase.from('admin_activity_logs').insert({
        action_type: entry.actionType,
        table_name: entry.tableName,
        record_id: entry.recordId,
        old_values: entry.oldValues ?? null,
        new_values: entry.newValues ?? null,
        performed_by: user?.id ?? null,
      });

      if (error) throw error;

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write audit log.';
      console.error('[AuditLog] Failed to record activity:', message);
      return { success: false, error: message };
    }
  }
}
