import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGestaoGarante, redirecionarSemEdicao } from "@/lib/acesso";
import { EditorModelo } from "@/components/garante/editor-modelo";
import { carregarModelo } from "../../dados";

export default async function ModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireGestaoGarante();
  redirecionarSemEdicao(acesso, "/garante/modelos");
  const { id } = await params;
  const dados = await carregarModelo(acesso, id);
  if (!dados) notFound();

  return (
    <div className="flex flex-col gap-3">
      <Link href="/garante/modelos" className="text-sm font-semibold text-azul-petroleo">
        ← Modelos
      </Link>
      <EditorModelo {...dados} />
    </div>
  );
}
