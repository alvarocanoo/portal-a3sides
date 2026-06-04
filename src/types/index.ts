// Re-export de los enums de Prisma para mantener compatibilidad con
// imports legacy (`@/types`). Prisma es la FUENTE ÚNICA DE VERDAD de
// estos enums; tener una copia local en este archivo causaba deriva
// silenciosa al añadir/cambiar valores en schema.prisma sin actualizar
// aquí. Solución §3.9 del informe.
//
// Para código nuevo, prefiere importar directamente de "@prisma/client".
export { Role, Priority } from "@prisma/client";
