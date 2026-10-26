import { CentralVideosAjuda } from "@/components/central-videos-ajuda";


/** Central de Vídeos explicativos (26/10/2026), aberta pelo Menu. Só lista os
 * vídeos estáticos de `public/videos`: qualquer pessoa logada vê (o layout do
 * app já exige a sessão), sem dado de unidade. */
export default function VideosExplicativosPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Vídeos explicativos</h1>
        <p className="text-sm text-cinza-medio">
          Vídeos curtos de cada parte do Zatti Hub. Dentro das telas, o link “Ver o vídeo” abre o vídeo daquela tela.
        </p>
      </div>
      <CentralVideosAjuda />
    </div>
  );
}
