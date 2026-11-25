import { inject } from '@angular/core';
import { supabase } from '../../../environments/supabase.config';

/**
 * USL Programs integration service.
 *
 * Fetches program listings from https://usl.edu.ph/programs/ so admins can
 * import them as news items in the InternLink dashboard carousel.
 *
 * NOTE: Browser fetch() to an external domain is subject to CORS. If the USL
 * site does not send Access-Control-Allow-Origin headers, this request will
 * be blocked by the browser. In that case, route the request through a
 * backend proxy (e.g. a Supabase Edge Function or your own API) and point
 * `uslProgramsUrl` at that proxy instead.
 */
export class UslProgramsService {
  private readonly supabase = supabase;

  /** USL programs page URL. Update this to a CORS-enabled proxy if needed. */
  readonly uslProgramsUrl = 'https://usl.edu.ph/programs/';

  /** Fetch raw HTML from the USL programs page. */
  async fetchUslProgramsHtml(): Promise<string> {
    const response = await fetch(this.uslProgramsUrl, {
      method: 'GET',
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) {
      throw new Error(`USL programs fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  /**
   * Parse program titles from HTML. This is a best-effort regex parser because
   * we cannot rely on a specific DOM structure without inspecting the live site.
   * Adjust the regex selectors below to match the actual USL page markup.
   */
  parseProgramsFromHtml(html: string): Array<{ title: string; excerpt: string }> {
    const programs: Array<{ title: string; excerpt: string }> = [];

    // Try to find common heading patterns (h1-h6) that might contain program names.
    // This is a heuristic — inspect the live site and refine as needed.
    const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const text = match[2]
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 3 && text.length < 120) {
        programs.push({
          title: text,
          excerpt: 'Internship program from University of Saint Louis Tuguegarao',
        });
      }
    }

    return programs;
  }

  /** Import USL programs as news items into the news table. */
  async importUslProgramsAsNews(): Promise<{ imported: number; skipped: number }> {
    const html = await this.fetchUslProgramsHtml();
    const programs = this.parseProgramsFromHtml(html);

    let imported = 0;
    let skipped = 0;

    for (const program of programs) {
      // Check if a news item with this title already exists (avoid duplicates)
      const { data: existing } = await this.supabase
        .from('news')
        .select('id')
        .eq('title', program.title)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await this.supabase
        .from('news')
        .insert({
          title: program.title,
          excerpt: program.excerpt,
          image_label: 'USL Program',
          image_url: null,
          link_url: this.uslProgramsUrl,
          is_published: true,
          published_at: new Date().toISOString(),
        });

      if (error) {
        skipped++;
      } else {
        imported++;
      }
    }

    return { imported, skipped };
  }
}
