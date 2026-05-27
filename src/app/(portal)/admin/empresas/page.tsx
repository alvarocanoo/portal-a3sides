import { requireRole } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db";
import { CreateCompanyForm } from "@/components/admin/create-company-form";

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
        <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
        <CreateCompanyForm />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {companies.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay empresas registradas.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  CIF/NIF
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID iRecursos
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Usuarios
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Incidencias
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50">
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
                      className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
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
