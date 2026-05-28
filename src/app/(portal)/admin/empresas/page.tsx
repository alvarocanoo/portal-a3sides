import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db";
import { CreateCompanyForm } from "@/components/admin/create-company-form";
import { Building2 } from "lucide-react";

export default async function EmpresasPage() {
  await requireRole("ADMIN");

  const companies = await prisma.company.findMany({
    include: {
      _count: { select: { users: true, incidents: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {companies.length} empresa{companies.length !== 1 && "s"}
          </p>
        </div>
        <CreateCompanyForm />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {companies.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">No hay empresas</p>
            <p className="text-sm text-gray-400">
              Crea la primera empresa o impórtala desde iRecursos
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CIF/NIF
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID iRecursos
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuarios
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Incidencias
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {company.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {company.taxId || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {company.irecursosClientId || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {company._count.users}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {company._count.incidents}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        company.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {company.isActive ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
