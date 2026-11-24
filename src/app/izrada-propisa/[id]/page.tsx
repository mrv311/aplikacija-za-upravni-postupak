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
export const maxDuration = 60;

export default async function IzradaPropisaProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getPropisProject(id);
  if (!project) {
    notFound();
  }

  const [documents, primjedbe, stressTests, deliverables, initialChatMessages] =
    await Promise.all([
      listPropisDocuments(id),
      listPrimjedbe(id),
      listStressTests(id),
      listDeliverables(id),
      readPropisChatHistory(id),
    ]);

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
