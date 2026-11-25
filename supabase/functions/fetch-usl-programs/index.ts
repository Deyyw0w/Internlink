import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch USL page SERVER-SIDE (browsers block this, servers don't)
    const res = await fetch('https://usl.edu.ph/programs/');
    if (!res.ok) throw new Error(`USL page returned ${res.status}`);
    const html = await res.text();

    // Extract program titles from headings
    const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    const programs: { title: string; excerpt: string }[] = [];
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

    // Insert into news table (skip duplicates)
    let imported = 0;
    let skipped = 0;
    for (const p of programs) {
      const { data: existing } = await supabase
        .from('news')
        .select('id')
        .eq('title', p.title)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      const { error } = await supabase.from('news').insert({
        title: p.title,
        excerpt: p.excerpt,
        image_label: 'USL Program',
        link_url: 'https://usl.edu.ph/programs/',
        is_published: true,
        published_at: new Date().toISOString(),
      });
      if (error) skipped++;
      else imported++;
    }

    return new Response(
      JSON.stringify({ imported, skipped, total: programs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});