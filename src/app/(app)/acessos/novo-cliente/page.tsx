import { NovoClienteForm } from "@/components/novo-cliente-form";

export default function NovoClientePage() {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-azul-noite">Novo cliente</h2>
      <p className="mt-1 text-sm text-cinza-medio">
        Cria a organização e a primeira unidade juntas. O ID de cada uma é gerado a partir do
        nome - se já existir um cadastro com o mesmo ID, o painel bloqueia e não sobrescreve nada.
      </p>
      <NovoClienteForm />
    </div>
  );
}
