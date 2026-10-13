import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const db = supabaseServer || supabase;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID predmeta je obavezan.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('predmeti')
      .update({ status: 'aktivan' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('API Unarchive Error:', error);
      if (error.code === '23514') {
        return NextResponse.json(
          {
            error:
              'Baza podataka još ima staro ograničenje statusa. Pokrenite SQL skriptu "02_arhiviranje_predmeta.sql" u Supabase SQL Editoru.',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('API Unarchive Handler Error:', err);
    return NextResponse.json({ error: err.message || 'Greška na poslužitelju.' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return POST(req, context);
}
