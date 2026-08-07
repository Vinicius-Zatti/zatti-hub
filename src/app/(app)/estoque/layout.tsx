import { EstoqueBreadcrumb } from "@/components/estoque-breadcrumb";

export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <EstoqueBreadcrumb />
      {children}
    </div>
  );
}
