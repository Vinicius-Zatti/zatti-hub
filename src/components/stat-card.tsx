export function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ambar" | "alerta";
}) {
  const toneClasses = {
    neutral: "bg-branco border-cinza-claro text-azul-noite",
    ambar: "bg-ambar/10 border-ambar text-azul-noite",
    alerta: "bg-vermelho/10 border-vermelho text-vermelho",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClasses}`}>
      <div className="break-words text-xl font-bold sm:text-2xl">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide text-cinza-medio">
        {label}
      </div>
    </div>
  );
}
