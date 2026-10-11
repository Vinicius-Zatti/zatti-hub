import { describe, expect, it } from "vitest";
import {
  contarPorStatus,
  dataIsoValida,
  diasDaSemana,
  erroRpcParaHttp,
  inicioDaSemana,
  nomeDoDia,
  normalizarPeca,
  ordenarLista,
  pecasDoDia,
  somarDias,
  validarCamposPeca,
  validarCorpoAtualizar,
  validarCorpoCriar,
  validarPeriodo,
} from "@/lib/conteudo/pecas";

const ID = "951c48a3-7b87-409c-b14c-59a5ae670d30";

describe("validarCamposPeca", () => {
  it("aceita peça completa e normaliza hora, links e vazios", () => {
    const r = validarCamposPeca(
      {
        titulo: "  Carrossel: CMV  ",
        data: "2026-10-12",
        hora: "19:00:00",
        status: "Roteiro pronto",
        formato: "Carrossel de fotos",
        etapa_funil: null,
        link_arquivos: "  https://drive.google.com/x  ",
        legenda: null,
      },
      false,
    );
    expect(r).toEqual({
      ok: true,
      valor: {
        titulo: "Carrossel: CMV",
        data: "2026-10-12",
        hora: "19:00",
        status: "Roteiro pronto",
        formato: "Carrossel de fotos",
        etapa_funil: "",
        link_arquivos: "https://drive.google.com/x",
        legenda: "",
      },
    });
  });

  it("recusa campo desconhecido, tipo errado e valores fora das listas", () => {
    expect(validarCamposPeca({ titulo: "x", foo: "1" }, false)).toEqual({ ok: false, erro: "campo não permitido: foo" });
    expect(validarCamposPeca({ titulo: 1 }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", status: "Publicado" }, false)).toEqual({ ok: false, erro: "campo inválido: status" });
    expect(validarCamposPeca({ titulo: "x", status: null }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", formato: "Reels" }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", etapa_funil: "Base" }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", data: "12/10/2026" }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", data: "2026-02-30" }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", hora: "24:00" }, false)).toMatchObject({ ok: false });
  });

  it("aplica limites de tamanho", () => {
    expect(validarCamposPeca({ titulo: "a".repeat(201) }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", roteiro: "a".repeat(20001) }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", roteiro: "a".repeat(20000) }, false)).toMatchObject({ ok: true });
    expect(validarCamposPeca({ titulo: "x", legenda: "a".repeat(5001) }, false)).toMatchObject({ ok: false });
    expect(validarCamposPeca({ titulo: "x", observacao: "a".repeat(2001) }, false)).toMatchObject({ ok: false });
  });

  it("POST exige título; PATCH exige ao menos um campo", () => {
    expect(validarCamposPeca({ status: "Ideia" }, false)).toEqual({ ok: false, erro: "campo inválido: titulo" });
    expect(validarCamposPeca({}, true)).toEqual({ ok: false, erro: "nenhum campo para mudar" });
    expect(validarCamposPeca({ data: null }, true)).toEqual({ ok: true, valor: { data: null } });
  });
});

describe("corpos da rota", () => {
  it("POST com origem_notion_id", () => {
    expect(validarCorpoCriar({ titulo: "x", origem_notion_id: "3f308b75-d0a3-81b7-9638-c16a8c68e8c2" })).toEqual({
      ok: true,
      valor: { titulo: "x", origem_notion_id: "3f308b75-d0a3-81b7-9638-c16a8c68e8c2" },
    });
    expect(validarCorpoCriar({ titulo: "x", origem_notion_id: "a b" })).toMatchObject({ ok: false });
    expect(validarCorpoCriar([])).toMatchObject({ ok: false });
  });

  it("PATCH exige id uuid e versão inteira e recusa origem_notion_id", () => {
    expect(validarCorpoAtualizar({ id: ID, versao: 3, status: "Gravado" })).toEqual({
      ok: true,
      valor: { id: ID, versao: 3, campos: { status: "Gravado" } },
    });
    expect(validarCorpoAtualizar({ id: "x", versao: 1, status: "Gravado" })).toEqual({ ok: false, erro: "campo inválido: id" });
    expect(validarCorpoAtualizar({ id: ID, versao: "1", status: "Gravado" })).toEqual({ ok: false, erro: "campo inválido: versao" });
    expect(validarCorpoAtualizar({ id: ID, versao: 2147483648, status: "Gravado" })).toEqual({ ok: false, erro: "campo inválido: versao" });
    expect(validarCorpoAtualizar({ id: ID, versao: 1, origem_notion_id: "abc" })).toMatchObject({ ok: false });
  });

  it("período do GET: os dois ou nenhum, até 366 dias", () => {
    expect(validarPeriodo(null, null)).toEqual({ ok: true, valor: { de: null, ate: null } });
    expect(validarPeriodo("2026-10-06", "2026-10-12")).toEqual({ ok: true, valor: { de: "2026-10-06", ate: "2026-10-12" } });
    expect(validarPeriodo("2026-10-06", null)).toMatchObject({ ok: false });
    expect(validarPeriodo("2026-10-12", "2026-10-06")).toMatchObject({ ok: false });
    expect(validarPeriodo("2026-01-01", "2027-01-03")).toMatchObject({ ok: false });
  });

  it("erros da RPC viram o status do contrato", () => {
    expect(erroRpcParaHttp({ code: "42501" }).status).toBe(401);
    expect(erroRpcParaHttp({ code: "P0002" }).status).toBe(404);
    expect(erroRpcParaHttp({ code: "PT409", message: "Versao divergente" }).status).toBe(409);
    expect(erroRpcParaHttp({ code: "P0001", message: "Versao divergente" }).status).toBe(409);
    expect(erroRpcParaHttp({ code: "22023", message: "Campo invalido: status" })).toEqual({ status: 400, erro: "campo inválido: status" });
    expect(erroRpcParaHttp({ code: "XX000" }).status).toBe(503);
  });
});

describe("datas da semana (string pura)", () => {
  it("semana começa na segunda", () => {
    expect(inicioDaSemana("2026-10-11")).toBe("2026-10-05"); // domingo
    expect(inicioDaSemana("2026-10-12")).toBe("2026-10-12"); // segunda
    expect(inicioDaSemana("2026-10-15")).toBe("2026-10-12");
    expect(diasDaSemana("2026-12-28")).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(nomeDoDia("2026-10-11")).toBe("Domingo");
    expect(dataIsoValida("2028-02-29")).toBe(true);
  });
});

describe("ordem e contagem", () => {
  const p = (titulo: string, data: string | null, hora: string | null, status = "Ideia") =>
    normalizarPeca({ id: titulo, titulo, data, hora, status, versao: 1 });

  it("dia: com hora primeiro, em ordem; sem hora no fim", () => {
    const lista = [p("c", "2026-10-12", null), p("b", "2026-10-12", "19:00:00"), p("a", "2026-10-12", "08:00:00"), p("z", "2026-10-13", "07:00")];
    expect(pecasDoDia(lista, "2026-10-12").map((x) => x.titulo)).toEqual(["a", "b", "c"]);
  });

  it("lista: mais recentes primeiro e sem data no fim", () => {
    const lista = [p("sem", null, null), p("velha", "2026-08-01", null), p("nova", "2026-10-12", null)];
    expect(ordenarLista(lista).map((x) => x.titulo)).toEqual(["nova", "velha", "sem"]);
  });

  it("contagem por status e hora HH:MM", () => {
    const lista = [p("a", null, null), p("b", "2026-10-12", "19:00:00", "Publicado todos"), p("c", null, null, "Publicado todos")];
    expect(contarPorStatus(lista)).toMatchObject({ Ideia: 1, "Publicado todos": 2, Gravado: 0 });
    expect(lista[1].hora).toBe("19:00");
  });
});
