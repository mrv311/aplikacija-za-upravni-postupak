import { listPropisProjectSummaries } from '@/lib/izrada-propisa-storage';
import { getPraksaCatalog } from '@/lib/rag';
import { PROPISI_LIST } from '@/lib/propisi-config';
import { PropisProjectsClient } from '@/components/izrada-propisa/PropisProjectsClient';

export const dynamic = 'force-dynamic';

export default async function IzradaPropisaPage() {
  const projects = await listPropisProjectSummaries();
  let praksaCount = 0;
  try {
    const catalog = await getPraksaCatalog();
    praksaCount = catalog.length;
  } catch {
    praksaCount = 0;
  }

  return (
    <PropisProjectsClient
      initialProjects={projects}
      praksaCount={praksaCount}
      zakoniCount={PROPISI_LIST.length}
    />
  );
}
