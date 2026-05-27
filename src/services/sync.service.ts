import { prisma } from "@/lib/db";
import { searchClient } from "@/lib/irecursos/client";

export class SyncService {
  static async importClientFromIRecursos(query: string) {
    const clients = await searchClient(query);
    if (clients.length === 0) return null;

    const client = clients[0];

    const existing = await prisma.company.findFirst({
      where: { irecursosClientId: client.codcli.trim() },
    });

    if (existing) {
      return { company: existing, created: false, client };
    }

    const company = await prisma.company.create({
      data: {
        name: client.name,
        taxId: client.nif || null,
        irecursosClientId: client.codcli.trim(),
      },
    });

    return { company, created: true, client };
  }

  static async searchClientsInIRecursos(query: string) {
    return searchClient(query);
  }
}
