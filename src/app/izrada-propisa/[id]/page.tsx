import { notFound } from 'next/navigation';
import {
  getPropisProject,
  listPropisDocuments,
  listPrimjedbe,
  listStressTests,
  listDeliverables,
  readPropisChatHistory,
} from '@/lib/izrada-propisa-storage';
import { getPraksaCatalog } from '@/lib/rag';
import { PROPISI_LIST } from '@/lib/propisi-config';
import { PropisWorkspace } from '@/components/izrada-propisa/PropisWorkspace';

export const dynamic = 'force-dynamic';

export default async function IzradaPropisaProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getPropisProject(id);
  if (!project) {
    notFound();
  }

  const documents = listPropisDocuments(id);
  const primjedbe = listPrimjedbe(id);
  const stressTests = listStressTests(id);
  const deliverables = listDeliverables(id);
  const initialChatMessages = readPropisChatHistory(id);

  let praksaCount = 0;
  try {
    const catalog = await getPraksaCatalog();
    praksaCount = catalog.length;
  } catch {
    praksaCount = 0;
  }

  return (
    <PropisWorkspace
      initialProject={project}
      initialDocuments={documents}
      initialPrimjedbe={primjedbe}
      initialStressTests={stressTests}
      initialDeliverables={deliverables}
      initialChatMessages={initialChatMessages}
      praksaCount={praksaCount}
      zakoniCount={PROPISI_LIST.length}
    />
  );
}
