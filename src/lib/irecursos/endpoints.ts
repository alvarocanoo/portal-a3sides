const BASE = process.env.IRECURSOS_BASE_URL || "https://a3sides.irecursos.net/admin2";

export const ENDPOINTS = {
  login: `${BASE}/es/index.php`,
  validate: `${BASE}/es/validar.php`,
  otDetail: (id: string) => `${BASE}/es/A-ot.php?id=${id}`,
  otNew: `${BASE}/es/A-ot.php`,
  otSave: `${BASE}/accionsbd/a_ot.php`,
  otList: `${BASE}/es/A-imprimir-llistat-embded.php`,
  clientSearch: `${BASE}/es/A-ot.php`,
  projectDetail: (id: string) => `${BASE}/es/A-projectes.php?id=${id}`,
  projectSave: `${BASE}/accionsbd/a_projectes.php`,
  parteDetail: (id: string) => `${BASE}/es/A-accions.php?id=${id}`,
  parteSave: `${BASE}/accionsbd/a_accions.php`,
  parteList: (otId: string) => `${BASE}/es/A-accions.php?ot=${otId}`,
} as const;
