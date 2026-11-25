import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UslProgramsService {
  private readonly baseUrl = environment.supabaseUrl;

  async importFromUsl(): Promise<{ imported: number; skipped: number; total: number }> {
    const res = await fetch(`${this.baseUrl}/functions/v1/fetch-usl-programs`, {
      method: 'POST',
      headers: {
        apikey: environment.supabaseAnonKey,
        Authorization: `Bearer ${environment.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}