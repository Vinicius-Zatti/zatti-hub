"use client";

import { useState } from "react";
import { gerarSlug } from "@/lib/slug";
import { criarClienteAdmin, type ResultadoCriarCliente } from "./actions";

type Papel = "gestao" | "operacional";

type UsuarioForm = { nome: string; email: string; role: Papel };

const USUARIO_VAZIO: UsuarioForm = { nome: "", email: "", role: "gestao" };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_USUARIOS = 20;

type Etapa = "formulario" | "confirmacao" | "resultado";

export function FormularioClienteNovo() {
  const [etapa, setEtapa] = useState<Etapa>("formulario");
  const [organizacaoNome, setOrganizacaoNome] = useState("");
  const [organizacaoId, setOrganizacaoId] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [tipoCliente, setTipoCliente] = useState<"consultoria" | "saas">("saas");
  const [unidadeNome, setUnidadeNome] = useState("");
  const [fonteDadosEstoque, setFonteDadosEstoque] = useState<"banco" | "planilha">("banco");
  const [usuarios, setUsuarios] = useState<UsuarioForm[]>([{ ...USUARIO_VAZIO }]);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCriarCliente | null>(null);

  function aoMudarNome(valor: string) {
    setOrganizacaoNome(valor);
    if (!slugTocado) setOrganizacaoId(gerarSlug(valor));
  }

  function aoMudarSlug(valor: string) {
    setSlugTocado(true);
    setOrganizacaoId(gerarSlug(valor));
  }

  function atualizarUsuario(indice: number, patch: Partial<UsuarioForm>) {
    setUsuarios((lista) => lista.map((u, i) => (i === indice ? { ...u, ...patch } : u)));
  }

  function adicionarUsuario() {
    if (usuarios.length >= MAX_USUARIOS) return;
    setUsuarios((lista) => [...lista, { ...USUARIO_VAZIO }]);
  }

  function removerUsuario(indice: number) {
    setUsuarios((lista) => (lista.length > 1 ? lista.filter((_, i) => i !== indice) : lista));
  }

  function validarForm(): string | null {
    if (!organizacaoNome.trim()) return "Preenche o nome da organização.";
    if (!organizacaoId.trim()) return "Preenche o identificador.";
    if (!unidadeNome.trim()) return "Preenche o nome da primeira unidade.";
    if (usuarios.length === 0) return "Adiciona pelo menos um usuário.";
    for (const u of usuarios) {
      if (!u.nome.trim()) return "Todo usuário precisa de nome.";
      if (!EMAIL_REGEX.test(u.email.trim())) return `E-mail inválido: ${u.email || "(vazio)"}`;
    }
    const emails = usuarios.map((u) => u.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) return "Tem e-mail repetido na lista.";
    return null;
  }

  function irParaConfirmacao() {
    const erro = validarForm();
    if (erro) {
      setErroForm(erro);
      return;
    }
    setErroForm(null);
    setEtapa("confirmacao");
  }

  async function confirmarCriacao() {
    setEnviando(true);
    setErroForm(null);
    const r = await criarClienteAdmin({
      organizacaoNome: organizacaoNome.trim(),
      organizacaoId,
      tipoCliente,
      unidadeNome: unidadeNome.trim(),
      fonteDadosEstoque,
      usuarios: usuarios.map((u) => ({
        nome: u.nome.trim(),
        email: u.email.trim().toLowerCase(),
        role: u.role,
        unidadeId: u.role === "operacional" ? organizacaoId : null,
      })),
    });
    setEnviando(false);
    if (!r.ok) {
      setErroForm(r.erro);
      return;
    }
    setResultado(r);
    setEtapa("resultado");
  }

  if (etapa === "resultado" && resultado?.ok) {
    return <TelaResultado resultado={resultado} />;
  }

  if (etapa === "confirmacao") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-cinza-claro bg-off-white p-4">
          <h2 className="font-display text-base font-bold text-azul-noite">Confere antes de criar</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-cinza-medio">Organização</dt>
            <dd className="font-medium text-azul-noite">{organizacaoNome}</dd>
            <dt className="text-cinza-medio">Identificador</dt>
            <dd className="font-mono text-azul-noite">{organizacaoId}</dd>
            <dt className="text-cinza-medio">Tipo de cliente</dt>
            <dd className="text-azul-noite">{tipoCliente === "saas" ? "SaaS" : "Consultoria"}</dd>
            <dt className="text-cinza-medio">Primeira unidade</dt>
            <dd className="text-azul-noite">{unidadeNome}</dd>
            <dt className="text-cinza-medio">Fonte do estoque</dt>
            <dd className="text-azul-noite">{fonteDadosEstoque === "banco" ? "Banco (Postgres)" : "Planilha"}</dd>
          </dl>
          <div className="mt-4 border-t border-cinza-claro pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">
              Usuários que vão receber convite/vínculo
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {usuarios.map((u, i) => (
                <li key={i} className="rounded-md bg-branco p-2.5 text-sm">
                  <span className="font-medium text-azul-noite">{u.nome}</span>{" "}
                  <span className="text-cinza-medio">({u.email})</span>
                  <br />
                  <span className="text-xs text-cinza-medio">
                    {u.role === "gestao"
                      ? "Gestão - acesso a toda a organização"
                      : `Operacional - restrito a "${unidadeNome}"`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {erroForm && (
          <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erroForm}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmarCriacao}
            disabled={enviando}
            className="flex-1 rounded-md bg-azul-noite px-3 py-2.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-50"
          >
            {enviando ? "Criando..." : "Criar cliente e enviar convites"}
          </button>
          <button
            type="button"
            onClick={() => setEtapa("formulario")}
            disabled={enviando}
            className="rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white"
          >
            Voltar e editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Nome da organização *</label>
        <input
          value={organizacaoNome}
          onChange={(e) => aoMudarNome(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-cinza-medio">
          Identificador (gerado automaticamente, pode editar)
        </label>
        <input
          value={organizacaoId}
          onChange={(e) => aoMudarSlug(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 font-mono text-sm focus:border-ambar focus:outline-none"
        />
        <p className="mt-1 text-xs text-cinza-medio">
          Confirmado como único só ao criar - se já existir com dados diferentes, a criação é
          rejeitada.
        </p>
      </div>
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Tipo de cliente *</label>
        <div className="mt-1.5 flex gap-2">
          {(["saas", "consultoria"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setTipoCliente(valor)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                tipoCliente === valor
                  ? "border-ambar bg-ambar/10 text-ambar"
                  : "border-cinza-claro text-cinza-medio hover:border-ambar"
              }`}
            >
              {valor === "saas" ? "SaaS" : "Consultoria"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Nome da primeira unidade *</label>
        <input
          value={unidadeNome}
          onChange={(e) => setUnidadeNome(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Fonte dos dados do estoque</label>
        <div className="mt-1.5 flex gap-2">
          {(["banco", "planilha"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFonteDadosEstoque(valor)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                fonteDadosEstoque === valor
                  ? "border-ambar bg-ambar/10 text-ambar"
                  : "border-cinza-claro text-cinza-medio hover:border-ambar"
              }`}
            >
              {valor === "banco" ? "Banco (recomendado)" : "Planilha"}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-cinza-claro pt-4">
        <p className="text-xs font-semibold text-cinza-medio">Usuários *</p>
        <div className="mt-2 flex flex-col gap-3">
          {usuarios.map((u, i) => (
            <div key={i} className="rounded-lg border border-cinza-claro p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  placeholder="Nome"
                  value={u.nome}
                  onChange={(e) => atualizarUsuario(i, { nome: e.target.value })}
                  className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none sm:flex-1"
                />
                <input
                  placeholder="E-mail"
                  value={u.email}
                  onChange={(e) => atualizarUsuario(i, { email: e.target.value })}
                  className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none sm:flex-1"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex gap-2">
                  {(["gestao", "operacional"] as const).map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => atualizarUsuario(i, { role: valor })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        u.role === valor
                          ? "border-ambar bg-ambar/10 text-ambar"
                          : "border-cinza-claro text-cinza-medio hover:border-ambar"
                      }`}
                    >
                      {valor === "gestao" ? "Gestão" : "Operacional"}
                    </button>
                  ))}
                </div>
                {usuarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerUsuario(i)}
                    className="text-xs font-semibold text-vermelho hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
              {u.role === "operacional" && (
                <p className="mt-1.5 text-xs text-cinza-medio">
                  Fica restrito à unidade &quot;{unidadeNome || "(nome da unidade)"}&quot;.
                </p>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={adicionarUsuario}
          disabled={usuarios.length >= MAX_USUARIOS}
          className="mt-2 rounded-md border border-cinza-claro px-3 py-2 text-xs font-semibold text-azul-petroleo hover:bg-off-white disabled:opacity-50"
        >
          + Adicionar usuário
        </button>
      </div>

      {erroForm && (
        <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erroForm}</p>
      )}

      <button
        type="button"
        onClick={irParaConfirmacao}
        className="rounded-md bg-azul-noite px-3 py-2.5 text-sm font-bold text-branco hover:bg-azul-petroleo"
      >
        Revisar antes de criar
      </button>
    </div>
  );
}

function TelaResultado({ resultado }: { resultado: Extract<ResultadoCriarCliente, { ok: true }> }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-verde/40 bg-verde/10 p-4">
        <h2 className="font-display text-base font-bold text-azul-noite">Cliente criado</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-cinza-medio">Organização</dt>
          <dd className="font-mono text-azul-noite">
            {resultado.organizacaoId} {resultado.organizacaoCriada ? "(criada agora)" : "(já existia)"}
          </dd>
          <dt className="text-cinza-medio">Unidade</dt>
          <dd className="font-mono text-azul-noite">
            {resultado.unidadeId} {resultado.unidadeCriada ? "(criada agora)" : "(já existia)"}
          </dd>
        </dl>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">Usuários</p>
        <ul className="mt-2 flex flex-col gap-2">
          {resultado.usuarios.map((u) => (
            <li key={u.email} className="rounded-md border border-cinza-claro p-2.5 text-sm">
              <span className="font-medium text-azul-noite">{u.nome}</span>{" "}
              <span className="text-cinza-medio">({u.email})</span>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <Selo ok={u.vinculoCriado} texto={u.vinculoCriado ? "Vínculo criado" : "Vínculo já existia"} />
                {u.convite === "enviado" && <Selo ok texto="Convite enviado" />}
                {u.convite === "nao_necessario" && <Selo ok texto="Já tinha conta - sem novo convite" />}
                {u.convite === "erro" && <Selo ok={false} texto={`Erro no convite: ${u.erroConvite ?? ""}`} />}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <a
        href="/admin/clientes/novo"
        className="rounded-md border border-cinza-claro px-3 py-2.5 text-center text-sm font-semibold text-cinza-medio hover:bg-off-white"
      >
        Cadastrar outro cliente
      </a>
    </div>
  );
}

function Selo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-semibold ${
        ok ? "bg-verde/15 text-verde" : "bg-vermelho/15 text-vermelho"
      }`}
    >
      {texto}
    </span>
  );
}
