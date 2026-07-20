import { criarProdutoAction } from "../actions";

const GRUPOS = [
  "PRO", "HOR", "LAT", "MER", "CON", "BEB", "BAL", "EMB", "DES", "LIM", "OPE",
];

export default function NovoProdutoPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Novo produto</h1>
      <form action={criarProdutoAction} className="mt-4 flex flex-col gap-3">
        <Campo label="SKU" name="sku" required placeholder="Ex: MERPBA001" />
        <div>
          <label className="text-xs font-semibold text-cinza-medio">Grupo</label>
          <select
            name="grupo"
            required
            className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          >
            {GRUPOS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <Campo label="Nome (contagem)" name="nome" required />
        <Campo label="Nome de compra" name="nomeCompra" />
        <Campo label="Unidade base (KG / LT / UN)" name="unidadeBase" defaultValue="UN" />
        <Campo label="Preço unitário" name="precoUnitario" type="number" step="0.01" />
        <Campo label="Estoque necessário da semana" name="estoqueNecessarioSemana" type="number" step="0.01" />
        <Campo label="Estoque mínimo" name="estoqueMinimo" type="number" step="0.01" />
        <div>
          <label className="text-xs font-semibold text-cinza-medio">Observações</label>
          <textarea
            name="observacoes"
            rows={2}
            className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo"
        >
          Salvar produto
        </button>
      </form>
    </div>
  );
}

function Campo({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-semibold text-cinza-medio">{label}</label>
      <input
        name={name}
        {...rest}
        className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
      />
    </div>
  );
}
